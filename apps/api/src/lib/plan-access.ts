import {
  actorInventoryAudience,
  planHasFeature,
  workspacePlanUsage,
  getLogger,
  type PlanFeature,
  type UserSession,
} from "@actorconsole/shared";
import { db } from "@actorconsole/db";
import { getUserApifyClient, type ApifyActorSummary } from "@actorconsole/apify";
import { createHash } from "node:crypto";
import { AppError } from "../middleware/error.js";
import { enqueue } from "./queue.js";

const log = getLogger("api:workspace-audience");

export async function getWorkspacePlanUsage(session: UserSession, refresh = false) {
  if (!session.businessProfileId)
    throw new AppError("workspace_required", "Select a workspace first", 409);
  const profile = await db.businessProfile.findFirst({
    where: { id: session.businessProfileId, userId: session.userId },
    select: {
      plan: true,
      apifyActorCount: true,
      apifyMonthlyUsers: true,
      apifyMonthlyUsersComplete: true,
      planUsageCheckedAt: true,
    },
  });
  if (!profile) throw new AppError("workspace_required", "Select a workspace first", 409);
  let verificationRequired = false;
  if (
    refresh &&
    (!profile.planUsageCheckedAt ||
      Date.now() - profile.planUsageCheckedAt.getTime() > 5 * 60_000 ||
      (profile.apifyMonthlyUsers === null && (profile.apifyActorCount ?? 0) > 0))
  ) {
    try {
      const apify = await getUserApifyClient(session.userId, session.businessProfileId);
      if (apify) {
        const inventory: ApifyActorSummary[] = [];
        for (let offset = 0; offset < 10_000; offset += 100) {
          const page = await apify.listMyActors({ limit: 100, offset });
          inventory.push(...page);
          if (page.length < 100) break;
        }
        const audience = actorInventoryAudience(inventory);
        const updateAudience =
          audience.monthlyUsers !== null &&
          (audience.monthlyUsersComplete || profile.apifyMonthlyUsers == null);
        profile.apifyActorCount = inventory.length;
        if (updateAudience) {
          profile.apifyMonthlyUsers = audience.monthlyUsers;
          profile.apifyMonthlyUsersComplete = audience.monthlyUsersComplete;
        }
        if (updateAudience) profile.planUsageCheckedAt = new Date();
        await db.businessProfile.update({
          where: { id: session.businessProfileId },
          data: {
            apifyActorCount: inventory.length,
            ...(updateAudience
              ? {
                  apifyMonthlyUsers: audience.monthlyUsers,
                  apifyMonthlyUsersComplete: audience.monthlyUsersComplete,
                }
              : {}),
            planUsageCheckedAt: profile.planUsageCheckedAt,
          },
        });
        if (!audience.monthlyUsersComplete) {
          try {
            await enqueue(
              "audience",
              {
                userId: session.userId,
                businessProfileId: session.businessProfileId,
              },
              {
                jobId: `workspace-audience-${session.businessProfileId}-${Math.floor(Date.now() / (5 * 60_000))}`,
                attempts: 3,
                backoff: { type: "exponential", delay: 5_000 },
                removeOnComplete: { age: 3_600 },
                removeOnFail: { age: 3_600 },
              },
            );
          } catch {
            log.warn(
              { businessProfileId: session.businessProfileId },
              "Could not queue workspace audience synchronization",
            );
          }
        }
      } else {
        const trackedCount = await db.actor.count({
          where: {
            businessProfileId: session.businessProfileId,
            userId: session.userId,
            apifyRemovedAt: null,
          },
        });
        verificationRequired =
          trackedCount > 0 ||
          (profile.apifyActorCount ?? 0) > 0 ||
          profile.apifyMonthlyUsers != null;
        // Retain known usage after disconnecting, so disconnect is not an upgrade bypass.
        profile.apifyActorCount = Math.max(profile.apifyActorCount ?? 0, trackedCount);
      }
    } catch (error) {
      // Reporting outages must not turn a paid workspace into a locked workspace.
      if (profile.plan !== "PRO") throw error;
      log.warn(
        { businessProfileId: session.businessProfileId },
        "Could not refresh Pro workspace audience; retaining cached usage",
      );
    }
  }
  const actorCount =
    profile.apifyActorCount ??
    (await db.actor.count({
      where: {
        businessProfileId: session.businessProfileId,
        userId: session.userId,
        apifyRemovedAt: null,
      },
    }));
  return {
    plan: profile.plan,
    verificationRequired,
    ...workspacePlanUsage(profile.plan, actorCount, profile.apifyMonthlyUsers ?? null),
    monthlyUsersComplete: profile.apifyMonthlyUsersComplete,
    checkedAt: profile.planUsageCheckedAt,
  };
}

const pendingUsageChecks = new Map<
  string,
  Promise<Awaited<ReturnType<typeof getWorkspacePlanUsage>>>
>();
export function refreshWorkspacePlanUsage(session: UserSession) {
  const key = `${session.userId}:${session.businessProfileId}`;
  const pending = pendingUsageChecks.get(key);
  if (pending) return pending;
  const check = getWorkspacePlanUsage(session, true).finally(() => pendingUsageChecks.delete(key));
  pendingUsageChecks.set(key, check);
  return check;
}

export async function assertPlanFeature(session: UserSession, feature: PlanFeature): Promise<void> {
  if (!planHasFeature(session.plan, feature))
    throw new AppError(
      "plan_feature_unavailable",
      "This feature is unavailable on your plan.",
      403,
      { plan: session.plan, feature },
    );
  // Connection setup and research are available at every usage level.
  if (
    session.plan === "PRO" ||
    ["keyword_research", "keyword_watchlist", "mcp_access"].includes(feature)
  )
    return;
  const usage = await refreshWorkspacePlanUsage(session);
  if (usage.upgradeRequired)
    throw new AppError(
      "plan_usage_limit_exceeded",
      "This workspace exceeds 50 actors or 500 monthly users. Upgrade to Pro to continue.",
      403,
      { ...usage, feature },
    );
  if (usage.verificationRequired && usage.plan !== "PRO")
    throw new AppError("apify_api_key_required", "Connect Apify to verify workspace usage", 409);
}

/**
 * Feature flags default to enabled when no row exists. This keeps new
 * deployments safe while allowing admins to create a kill switch at runtime.
 * Rollouts are deterministic per user so a request cannot flip cohorts.
 */
export async function isFeatureEnabled(key: string, userId?: string): Promise<boolean> {
  const featureFlag = (db as typeof db & { featureFlag?: typeof db.featureFlag }).featureFlag;
  if (!featureFlag) return true;
  const flag = await featureFlag.findUnique({ where: { key } });
  if (!flag) return true;
  if (!flag.enabled) return false;
  if (flag.rolloutPct >= 100 || !userId) return true;
  if (flag.rolloutPct <= 0) return false;
  const bucket = createHash("sha256").update(`${key}:${userId}`).digest().readUInt32BE(0) % 100;
  return bucket < flag.rolloutPct;
}

export async function assertFeatureEnabled(key: string, userId?: string): Promise<void> {
  if (await isFeatureEnabled(key, userId)) return;
  throw new AppError("feature_disabled", "This feature is temporarily unavailable.", 503, { key });
}
