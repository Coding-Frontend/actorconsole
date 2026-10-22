import { UnrecoverableError } from "bullmq";
import { db } from "@actorconsole/db";
import { workspacePlanUsage } from "@actorconsole/shared";
import { getUserApifyClient, collectWorkspaceAudience } from "@actorconsole/apify";

export async function assertWorkspacePlanAccess(userId: string, businessProfileId: string) {
  const profile = await db.businessProfile.findFirst({
    where: { id: businessProfileId, userId },
    select: {
      plan: true,
      apifyActorCount: true,
      apifyMonthlyUsers: true,
      planUsageCheckedAt: true,
    },
  });
  if (!profile) throw new UnrecoverableError("Workspace is unavailable");
  if (profile.plan === "PRO") return;
  // Scheduled jobs must notice audience growth even when nobody opens the dashboard.
  if (
    !profile.planUsageCheckedAt ||
    Date.now() - profile.planUsageCheckedAt.getTime() > 5 * 60_000
  ) {
    const apify = await getUserApifyClient(userId, businessProfileId);
    if (!apify) throw new UnrecoverableError("Connect an Apify API key to verify workspace usage");
    const audience = await collectWorkspaceAudience(apify);
    const updateAudience =
      audience.monthlyUsers !== null &&
      (audience.monthlyUsersComplete || profile.apifyMonthlyUsers == null);
    profile.apifyActorCount = audience.actorCount;
    if (updateAudience) profile.apifyMonthlyUsers = audience.monthlyUsers;
    await db.businessProfile.update({
      where: { id: businessProfileId },
      data: {
        apifyActorCount: audience.actorCount,
        ...(updateAudience
          ? {
              apifyMonthlyUsers: audience.monthlyUsers,
              apifyMonthlyUsersComplete: audience.monthlyUsersComplete,
            }
          : {}),
        planUsageCheckedAt: new Date(),
      },
    });
  }
  const actorCount =
    profile.apifyActorCount ??
    (await db.actor.count({ where: { businessProfileId, userId, apifyRemovedAt: null } }));
  if (workspacePlanUsage(profile.plan, actorCount, profile.apifyMonthlyUsers).upgradeRequired) {
    throw new UnrecoverableError(
      "This workspace exceeds 50 actors or 500 monthly users. Upgrade to Pro to continue.",
    );
  }
}
