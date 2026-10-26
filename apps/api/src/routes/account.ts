import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@actorconsole/db";
import { cancelScheduledDeletion } from "@actorconsole/db";
import { getCookie } from "hono/cookie";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/error.js";
import { trackEvent } from "../lib/analytics.js";
import { assertPlanFeature, refreshWorkspacePlanUsage } from "../lib/plan-access.js";
import { recordUserAudit } from "../lib/user-audit.js";
import { loadDefaultDashboard } from "../lib/default-dashboard.js";
import { loadPublishingOverview } from "../lib/publishing-overview.js";
import { consumeTwoFactorRecoveryCode } from "../lib/two-factor-recovery.js";
import { checkRateLimit } from "../lib/rate-limit";
import { ApifyClientError, getApifyAccountIdentity } from "@actorconsole/apify";
import { createHash, randomBytes } from "node:crypto";
import { integerQuery, limitQuery } from "../lib/query.js";
import {
  businessProfileScope,
  getActiveBusinessProfile,
  setActiveBusinessProfile,
  slugify,
} from "../lib/business-profile.js";
import {
  MCP_CAPABILITIES,
  decrypt,
  encrypt,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpUri,
  verifyTotpCode,
} from "@actorconsole/shared";
import type { McpCapability } from "@actorconsole/shared";
import type { AppEnv } from "../app.js";

const MAX_ACTIVE_API_KEYS_PER_WORKSPACE = 20;
const TOTP_KEY_PREFIX = "totp:";
const DASHBOARD_QUERY_BUDGET_MS = 2_500;
const APIFY_IDENTITY_PREVIEW_TIMEOUT_MS = 10_000;

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Apify identity lookup timed out")), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function withDashboardBudget<T>(
  operation: PromiseLike<T>,
  fallback: T,
  budgetMs = DASHBOARD_QUERY_BUDGET_MS,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), budgetMs);
    Promise.resolve(operation).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function encryptionKey(): string {
  const value = process.env.APP_ENCRYPTION_KEY;
  if (!value)
    throw new AppError("totp_unavailable", "Two-factor authentication is not configured", 503);
  return value;
}

function recoveryCodesFromJson(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : [];
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : [];
}

function capabilityArrayFromJson(value: unknown): McpCapability[] {
  const allowed = new Set<string>(MCP_CAPABILITIES);
  return stringArrayFromJson(value).filter((item): item is McpCapability => allowed.has(item));
}

async function verifySecondFactor(
  userId: string,
  code: string,
): Promise<{ factor: "totp" | "recovery"; encryptedSecret: string } | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true, totpSecretEncrypted: true, totpRecoveryCodes: true },
  });
  if (!user?.totpEnabled || !user.totpSecretEncrypted) return null;
  const secret = decrypt(user.totpSecretEncrypted, encryptionKey(), `${TOTP_KEY_PREFIX}${userId}`);
  if (verifyTotpCode(secret, code)) {
    return { factor: "totp", encryptedSecret: user.totpSecretEncrypted };
  }

  const hashed = hashRecoveryCode(code, userId, encryptionKey());
  return await consumeTwoFactorRecoveryCode(db, userId, hashed, user.totpSecretEncrypted)
    ? { factor: "recovery", encryptedSecret: user.totpSecretEncrypted } : null;
}

async function enforceTwoFactorRateLimit(userId: string, action: string, max = 5) {
  const rate = await checkRateLimit(`2fa:${action}:${userId}`, {
    label: `Two-factor ${action}`,
    windowMs: 15 * 60 * 1000,
    max,
  });
  if (!rate.allowed) {
    throw new AppError(
      "rate_limited",
      "Too many two-factor attempts. Try again in 15 minutes.",
      429,
    );
  }
}

export const accountRoutes = new Hono<AppEnv>()
  .use("*", requireAuth())

  .get("/publishing-overview", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({
      ok: true,
      data: await loadPublishingOverview(
        c.get("session"),
        integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 }),
      ),
    });
  })

  .get("/default-dashboard", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({
      ok: true,
      data: await loadDefaultDashboard(c.get("session"), {
        from: c.req.query("from"),
        to: c.req.query("to"),
      }),
    });
  })

  // ==================== Apify identity preview ====================
  // Resolve the account name before the first workspace exists. The token is
  // used only for this server-side lookup and is never returned to the client
  // or written to the database by this endpoint.
  .post(
    "/onboarding/apify-preview",
    zValidator(
      "json",
      z
        .object({
          token: z.string().trim().min(20, "Apify API keys are at least 20 characters").max(256),
        })
        .strict(),
    ),
    async (c) => {
      const { token } = c.req.valid("json");
      try {
        const identity = await withTimeout(
          getApifyAccountIdentity(token),
          APIFY_IDENTITY_PREVIEW_TIMEOUT_MS,
        );
        return c.json({ ok: true, data: identity });
      } catch (error) {
        throw new AppError(
          "apify_identity_preview_failed",
          error instanceof ApifyClientError
            ? error.message
            : "Could not verify the Apify API key. Check the key and try again.",
          error instanceof ApifyClientError && error.status === 429 ? 429 : 400,
        );
      }
    },
  )

  // ==================== Business profiles ====================
  .get("/business-profiles", async (c) => {
    const session = c.get("session");
    const active = await getActiveBusinessProfile(c, session.userId);
    const profiles = await db.businessProfile.findMany({
      where: { userId: session.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { actors: true } },
        apifyTokens: {
          select: {
            encryptedToken: true,
            encryptedUiToken: true,
            encryptedCookies: true,
            apifyUsername: true,
            apiTokenStatus: true,
            uiTokenStatus: true,
            cookiesStatus: true,
          },
          take: 1,
        },
      },
    });
    return c.json({
      ok: true,
      data: profiles.map((profile) => {
        const credential = profile.apifyTokens[0];
        const unhealthyStatuses = ["EXPIRED", "INVALID", "ERROR"];
        const credentialStatuses = credential
          ? [
              credential.encryptedToken ? credential.apiTokenStatus : null,
              credential.encryptedUiToken ? credential.uiTokenStatus : null,
              credential.encryptedCookies ? credential.cookiesStatus : null,
            ]
          : [];
        return {
          id: profile.id,
          name: profile.name,
          slug: profile.slug,
          plan: profile.plan,
          industry: profile.industry,
          website: profile.website,
          isDefault: profile.isDefault,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
          actorCount: profile._count.actors,
          credentialStatus: credential
            ? credentialStatuses.some(
                (status) => status !== null && unhealthyStatuses.includes(status),
              )
              ? "ISSUE"
              : "CONNECTED"
            : "NOT_CONFIGURED",
          apiKeyConfigured: Boolean(credential?.encryptedToken),
          consoleConfigured: Boolean(credential?.encryptedCookies || credential?.encryptedUiToken),
          apifyUsername: credential?.apifyUsername ?? null,
          active: profile.id === active?.id,
        };
      }),
    });
  })

  .post(
    "/business-profiles",
    zValidator(
      "json",
      z.object({
        name: z.string().trim().min(1).max(100),
        industry: z.string().trim().max(100).optional().nullable(),
        website: z.string().trim().url().max(500).optional().nullable(),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      const body = c.req.valid("json");
      const baseSlug = slugify(body.name);
      const existingProfileCount = await db.businessProfile.count({
        where: { userId: session.userId },
      });
      let slug = baseSlug;
      let suffix = 2;
      while (
        await db.businessProfile.findUnique({
          where: { userId_slug: { userId: session.userId, slug } },
        })
      ) {
        slug = `${baseSlug}-${suffix++}`;
      }
      const profile = await db.businessProfile.create({
        data: {
          userId: session.userId,
          name: body.name,
          slug,
          industry: body.industry ?? null,
          website: body.website ?? null,
          isDefault: existingProfileCount === 0,
          onboardingStates: {
            create: {
              userId: session.userId,
              profileComplete: true,
            },
          },
        },
      });
      setActiveBusinessProfile(c, profile.id);
      return c.json({ ok: true, data: { ...profile, active: true } }, 201);
    },
  )

  .patch(
    "/business-profiles/:id",
    zValidator(
      "json",
      z.object({
        name: z.string().trim().min(1).max(100).optional(),
        industry: z.string().trim().max(100).optional().nullable(),
        website: z.string().trim().url().max(500).optional().nullable(),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      const id = c.req.param("id");
      const body = c.req.valid("json");
      const result = await db.businessProfile.updateMany({
        where: { id, userId: session.userId },
        data: body,
      });
      if (result.count === 0) throw new AppError("not_found", "Business profile not found", 404);
      const profile = await db.businessProfile.findFirst({ where: { id, userId: session.userId } });
      return c.json({ ok: true, data: profile });
    },
  )

  .post("/business-profiles/:id/select", async (c) => {
    const session = c.get("session");
    const profile = await db.businessProfile.findFirst({
      where: { id: c.req.param("id"), userId: session.userId },
    });
    if (!profile) throw new AppError("not_found", "Business profile not found", 404);
    setActiveBusinessProfile(c, profile.id);
    return c.json({ ok: true, data: { ...profile, active: true } });
  })

  .delete("/business-profiles/:id", async (c) => {
    const session = c.get("session");
    const id = c.req.param("id");
    const profiles = await db.businessProfile.findMany({
      where: { userId: session.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!profiles.some((profile) => profile.id === id)) {
      throw new AppError("not_found", "Business profile not found", 404);
    }
    if (profiles.length === 1) {
      throw new AppError("last_business_profile", "Keep at least one business profile", 409);
    }
    await db.businessProfile.delete({ where: { id } });
    const nextProfile = profiles.find((profile) => profile.id !== id)!;
    setActiveBusinessProfile(c, nextProfile.id);
    return c.json({ ok: true, data: { deleted: id, activeProfileId: nextProfile.id } });
  })

  .get("/dashboard-summary", async (c) => {
    const session = c.get("session");
    const profileScope = businessProfileScope(session);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Keep the first paint database-only. Redis/BullMQ is an execution
    // dependency and must not hold the overview open when the worker is down.
    // Optional checks keep lightweight test/dev Prisma doubles compatible.
    const prisma = db as any;
    const queueCountsPromise = prisma.bulkActorStatusOperation?.count
      ? prisma.bulkActorStatusOperation
          .count({
            where: {
              userId: session.userId,
              ...profileScope,
              status: { in: ["QUEUED", "RUNNING"] },
            },
          })
          .then((operations: number) => ({ operations, total: operations }))
      : Promise.resolve({ operations: 0, total: 0 });
    const [
      actorCount,
      publishingScheduleCount,
      recentActors,
      usageCost,
      apifyCredential,
      queueCounts,
    ] = await Promise.all([
      withDashboardBudget(
        db.actor.count({
          where: { userId: session.userId, ...profileScope, apifyRemovedAt: null },
        }),
        0,
      ),
      withDashboardBudget(
        db.bulkPublishSchedule.count({
          where: { userId: session.userId, ...profileScope, enabled: true },
        }),
        0,
      ),
      withDashboardBudget(
        db.actor.findMany({
          where: { userId: session.userId, ...profileScope, apifyRemovedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            actorName: true,
            username: true,
            updatedAt: true,
          },
        }),
        [],
      ),
      withDashboardBudget(
        db.usageDaily.aggregate({
          where: {
            actor: { userId: session.userId, ...profileScope },
            date: { gte: thirtyDaysAgo },
          },
          _sum: { usageCostUsd: true },
        }),
        { _sum: { usageCostUsd: null } },
      ),
      session.businessProfileId
        ? withDashboardBudget(
            db.apifyToken.findUnique({
              where: { businessProfileId: session.businessProfileId },
              select: {
                encryptedToken: true,
                encryptedUiToken: true,
                encryptedCookies: true,
                apiTokenStatus: true,
                uiTokenStatus: true,
                cookiesStatus: true,
                validatedAt: true,
                validationError: true,
              },
            }),
            null,
          )
        : withDashboardBudget(
            db.apifyToken.findFirst({
              where: { userId: session.userId },
              orderBy: { updatedAt: "desc" },
              select: {
                encryptedToken: true,
                encryptedUiToken: true,
                encryptedCookies: true,
                apiTokenStatus: true,
                uiTokenStatus: true,
                cookiesStatus: true,
                validatedAt: true,
                validationError: true,
              },
            }),
            null,
          ),
      withDashboardBudget(queueCountsPromise, { operations: 0, total: 0 }),
    ]);
    const unhealthyStatuses = ["EXPIRED", "INVALID", "ERROR"];
    const credentialHealth = apifyCredential
      ? {
          configured: true,
          apiKey: {
            configured: Boolean(apifyCredential.encryptedToken),
            status: apifyCredential.apiTokenStatus,
          },
          uiToken: {
            configured: Boolean(apifyCredential.encryptedUiToken),
            status: apifyCredential.uiTokenStatus,
          },
          cookies: {
            configured: Boolean(apifyCredential.encryptedCookies),
            status: apifyCredential.cookiesStatus,
          },
          hasIssue: [
            apifyCredential.encryptedToken ? apifyCredential.apiTokenStatus : null,
            apifyCredential.encryptedUiToken ? apifyCredential.uiTokenStatus : null,
            apifyCredential.encryptedCookies ? apifyCredential.cookiesStatus : null,
          ].some((status) => status !== null && unhealthyStatuses.includes(status)),
          validatedAt: apifyCredential.validatedAt,
          validationError: apifyCredential.validationError,
        }
      : { configured: false, hasIssue: false };
    return c.json({
      ok: true,
      data: {
        actorCount,
        publishingScheduleCount,
        queueCounts,
        recentActors,
        usageCostTotal: usageCost._sum.usageCostUsd ?? 0,
        credentialHealth,
      },
    });
  })

  .get("/workspace-access", async (c) => {
    const session = c.get("session");
    c.header("Cache-Control", "no-store");
    if (!session.businessProfileId)
      return c.json({
        ok: true,
        data: { workspaceId: null, plan: session.plan, restricted: false, usage: null },
      });
    const usage = await refreshWorkspacePlanUsage(session);
    return c.json({
      ok: true,
      data: {
        workspaceId: session.businessProfileId,
        plan: usage.plan,
        restricted: usage.upgradeRequired,
        usage,
      },
    });
  })
  .get("/api-key-actors", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId)
      throw new AppError("workspace_required", "Select a workspace first", 409);
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 500, 500);
    const where = {
      businessProfileId: session.businessProfileId,
      userId: session.userId,
      apifyRemovedAt: null,
    };
    const [items, total] = await Promise.all([
      db.actor.findMany({
        where,
        select: { apifyActorId: true, title: true, actorName: true, username: true },
        orderBy: { id: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.actor.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  .get("/navigation-status", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId) {
      return c.json({
        ok: true,
        data: {
          workspaceId: null,
          unreadNotifications: 0,
          credentialIssue: false,
          expiredApiKeys: 0,
          plan: session.plan,
        },
      });
    }

    const workspaceId = session.businessProfileId;
    const [unreadNotifications, credential, expiredApiKeys] = await Promise.all([
      withDashboardBudget(
        db.notification.count({
          where: { userId: session.userId, businessProfileId: workspaceId, readAt: null },
        }),
        0,
      ),
      withDashboardBudget(
        db.apifyToken.findUnique({
          where: { businessProfileId: workspaceId },
          select: {
            encryptedToken: true,
            encryptedUiToken: true,
            encryptedCookies: true,
            apiTokenStatus: true,
            uiTokenStatus: true,
            cookiesStatus: true,
          },
        }),
        null,
      ),
      withDashboardBudget(
        db.apiKey.count({
          where: {
            userId: session.userId,
            businessProfileId: workspaceId,
            revokedAt: null,
            expiresAt: { lte: new Date() },
          },
        }),
        0,
      ),
    ]);
    const unhealthyStatuses = ["EXPIRED", "INVALID", "ERROR"];
    const credentialIssue = Boolean(
      credential &&
      [
        credential.encryptedToken ? credential.apiTokenStatus : null,
        credential.encryptedUiToken ? credential.uiTokenStatus : null,
        credential.encryptedCookies ? credential.cookiesStatus : null,
      ].some((status) => status !== null && unhealthyStatuses.includes(status)),
    );

    return c.json({
      ok: true,
      data: {
        workspaceId,
        unreadNotifications,
        credentialIssue,
        expiredApiKeys,
        plan: session.plan,
      },
    });
  })

  .get("/billing-overview", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    const page = integerQuery(c.req.query("page"), {
      name: "page",
      defaultValue: 1,
      max: 100_000,
    });
    const limit = limitQuery(c.req.query("limit"), 25, 500);
    const [user, workspace, paymentTotal] = await Promise.all([
      db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, name: true, email: true, billingAddresses: true },
      }),
      db.businessProfile.findFirst({
        where: { id: session.businessProfileId, userId: session.userId },
        select: {
          id: true,
          name: true,
          plan: true,
          subscriptions: { orderBy: { updatedAt: "desc" }, take: 10 },
          payments: {
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
          },
        },
      }),
      db.payment.count({ where: { businessProfileId: session.businessProfileId } }),
    ]);
    if (!user || !workspace) throw new AppError("not_found", "Workspace not found", 404);
    return c.json({
      ok: true,
      data: {
        ...user,
        workspace: { id: workspace.id, name: workspace.name },
        plan: workspace.plan,
        subscriptions: workspace.subscriptions,
        payments: workspace.payments,
        paymentsPagination: { total: paymentTotal, page, limit },
      },
    });
  })

  .get("/deletion", async (c) => {
    const session = c.get("session");
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { deletionRequestedAt: true, deletionScheduledFor: true },
    });
    return c.json({ ok: true, data: user });
  })

  .post("/deletion/cancel", async (c) => {
    const session = c.get("session");
    let cancelled: boolean;
    try {
      cancelled = await cancelScheduledDeletion(session.userId);
    } catch (error) {
      if (error instanceof Error && error.message === "deletion_email_conflict") {
        throw new AppError(
          "deletion_email_conflict",
          "That email address has already been used by another account during the grace period.",
          409,
        );
      }
      throw error;
    }
    if (!cancelled) throw new AppError("deletion_not_pending", "No pending account deletion", 409);
    await recordUserAudit(c, session, "account.deletion.cancelled", `user:${session.userId}`);
    return c.json({ ok: true, data: { cancelled: true } });
  })

  .post("/impersonation/exit", async (c) => {
    const session = c.get("session");
    if (session.authMethod !== "impersonation") {
      throw new AppError("not_impersonating", "This session is not an impersonation session", 409);
    }
    const currentToken =
      getCookie(c, "authjs.session-token") ?? getCookie(c, "__Secure-authjs.session-token");
    if (currentToken) await db.session.deleteMany({ where: { sessionToken: currentToken } });
    return c.json({ ok: true, data: { exited: true } });
  })

  // ==================== Two-factor authentication ====================
  .get("/2fa", async (c) => {
    const session = c.get("session");
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { totpEnabled: true, totpSecretEncrypted: true, totpRecoveryCodes: true },
    });
    return c.json({
      ok: true,
      data: {
        enabled: Boolean(user?.totpEnabled),
        setupPending: Boolean(user?.totpSecretEncrypted && !user?.totpEnabled),
        recoveryCodesRemaining: recoveryCodesFromJson(user?.totpRecoveryCodes).length,
      },
    });
  })

  .post("/2fa/setup", async (c) => {
    const session = c.get("session");
    await enforceTwoFactorRateLimit(session.userId, "setup", 3);
    const current = await db.user.findUnique({
      where: { id: session.userId },
      select: { totpEnabled: true },
    });
    if (current?.totpEnabled) {
      throw new AppError(
        "totp_already_enabled",
        "Two-factor authentication is already enabled",
        409,
      );
    }
    const secret = generateTotpSecret();
    const setup = await db.user.updateMany({
      where: { id: session.userId, totpEnabled: false },
      data: {
        totpSecretEncrypted: encrypt(
          secret,
          encryptionKey(),
          `${TOTP_KEY_PREFIX}${session.userId}`,
        ),
        totpRecoveryCodes: [],
      },
    });
    if (setup.count !== 1) {
      throw new AppError("totp_already_enabled", "Two-factor authentication is already enabled", 409);
    }
    return c.json({
      ok: true,
      data: {
        secret,
        uri: totpUri({ secret, account: session.email }),
        issuer: "ActorConsole",
      },
    });
  })

  .post(
    "/2fa/confirm",
    zValidator("json", z.object({ code: z.string().min(6).max(20) })),
    async (c) => {
      const session = c.get("session");
      await enforceTwoFactorRateLimit(session.userId, "confirm");
      const { code } = c.req.valid("json");
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: { totpEnabled: true, totpSecretEncrypted: true },
      });
      if (user?.totpEnabled) return c.json({ ok: true, data: { enabled: true } });
      if (!user?.totpSecretEncrypted) {
        throw new AppError("totp_setup_required", "Start two-factor setup first", 400);
      }
      const secret = decrypt(
        user.totpSecretEncrypted,
        encryptionKey(),
        `${TOTP_KEY_PREFIX}${session.userId}`,
      );
      if (!verifyTotpCode(secret, code)) {
        throw new AppError("totp_invalid", "That verification code is not valid", 400);
      }
      const recoveryCodes = generateRecoveryCodes();
      const confirmed = await db.user.updateMany({
        where: {
          id: session.userId,
          totpEnabled: false,
          totpSecretEncrypted: user.totpSecretEncrypted,
        },
        data: {
          totpEnabled: true,
          totpRecoveryCodes: recoveryCodes.map((value) =>
            hashRecoveryCode(value, session.userId, encryptionKey()),
          ),
        },
      });
      if (confirmed.count !== 1) {
        throw new AppError("totp_setup_changed", "Two-factor setup changed. Please try again.", 409);
      }
      await recordUserAudit(c, session, "security.2fa.enabled", `user:${session.userId}`);
      return c.json({ ok: true, data: { enabled: true, recoveryCodes } });
    },
  )

  .post(
    "/2fa/disable",
    zValidator("json", z.object({ code: z.string().min(6).max(20) })),
    async (c) => {
      const session = c.get("session");
      await enforceTwoFactorRateLimit(session.userId, "disable");
      const factor = await verifySecondFactor(session.userId, c.req.valid("json").code);
      if (!factor) throw new AppError("totp_invalid", "That verification code is not valid", 400);
      const disabled = await db.user.updateMany({
        where: { id: session.userId, totpEnabled: true, totpSecretEncrypted: factor.encryptedSecret },
        data: { totpEnabled: false, totpSecretEncrypted: null, totpRecoveryCodes: [] },
      });
      if (disabled.count !== 1) {
        throw new AppError("totp_setup_changed", "Two-factor setup changed. Please try again.", 409);
      }
      await recordUserAudit(c, session, "security.2fa.disabled", `user:${session.userId}`, {
        factor: factor.factor,
      });
      return c.json({ ok: true, data: { enabled: false } });
    },
  )

  .post(
    "/2fa/recovery-codes",
    zValidator("json", z.object({ code: z.string().min(6).max(20) })),
    async (c) => {
      const session = c.get("session");
      await enforceTwoFactorRateLimit(session.userId, "recovery-codes");
      const factor = await verifySecondFactor(session.userId, c.req.valid("json").code);
      if (!factor) throw new AppError("totp_invalid", "That verification code is not valid", 400);
      const recoveryCodes = generateRecoveryCodes();
      const regenerated = await db.user.updateMany({
        where: { id: session.userId, totpEnabled: true, totpSecretEncrypted: factor.encryptedSecret },
        data: {
          totpRecoveryCodes: recoveryCodes.map((value) =>
            hashRecoveryCode(value, session.userId, encryptionKey()),
          ),
        },
      });
      if (regenerated.count !== 1) {
        throw new AppError("totp_setup_changed", "Two-factor setup changed. Please try again.", 409);
      }
      await recordUserAudit(
        c,
        session,
        "security.2fa.recovery_codes.regenerated",
        `user:${session.userId}`,
      );
      return c.json({ ok: true, data: { recoveryCodes } });
    },
  )

  // ==================== Profile ====================
  .get("/profile", async (c) => {
    const session = c.get("session");
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        image: true,
        bio: true,
        createdAt: true,
      },
    });
    return c.json({
      ok: true,
      data: user
        ? { ...user, plan: session.plan, businessProfileId: session.businessProfileId }
        : null,
    });
  })

  .patch(
    "/profile",
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(100).optional(),
        username: z
          .string()
          .trim()
          .regex(/^[a-zA-Z0-9_]{3,30}$/)
          .optional()
          .nullable(),
        bio: z.string().max(500).optional().nullable(),
        image: z.string().url().optional().nullable(),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      const body = c.req.valid("json");
      if (body.username) {
        const existing = await db.user.findUnique({
          where: { username: body.username },
          select: { id: true },
        });
        if (existing && existing.id !== session.userId) {
          throw new AppError("username_taken", "This username is already taken", 409);
        }
      }
      const updated = await db.user.update({
        where: { id: session.userId },
        data: body,
        select: { id: true, name: true, username: true, email: true, image: true, bio: true },
      });
      trackEvent("profile.updated", { userId: session.userId });
      return c.json({ ok: true, data: updated });
    },
  )

  // ==================== Account Deletion ====================
  .delete("/", zValidator("json", z.object({ confirmation: z.literal("DELETE") })), async (c) => {
    const session = c.get("session");
    const rate = await checkRateLimit(`account:delete:${session.userId}`, {
      windowMs: 86400000,
      max: 1,
    });
    if (!rate.allowed) {
      return c.json(
        {
          ok: false,
          error: { code: "rate_limited", message: "Account can only be deleted once per day." },
        },
        429,
      );
    }
    const deletionScheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { email: true, deletionOriginalEmail: true },
    });
    if (!user) throw new AppError("not_found", "Account not found", 404);
    const originalEmail = user.deletionOriginalEmail ?? user.email;
    await db.user.update({
      where: { id: session.userId },
      data: {
        email: `deleted+${session.userId}@deleted.actorconsole.invalid`,
        deletionOriginalEmail: originalEmail,
        deletionRequestedAt: new Date(),
        deletionScheduledFor,
        suspendedAt: new Date(),
        bannedReason: "User requested deletion",
      },
    });
    // Keep only the current browser session so the user can cancel during
    // the grace period; every other credential is invalidated immediately.
    const currentToken =
      getCookie(c, "authjs.session-token") ?? getCookie(c, "__Secure-authjs.session-token");
    await db.session.deleteMany({
      where: {
        userId: session.userId,
        ...(currentToken ? { sessionToken: { not: currentToken } } : {}),
      },
    });
    trackEvent("account.deletion.requested", { userId: session.userId });
    return c.json({
      ok: true,
      data: { deleted: false, deletionScheduledFor, gracePeriodDays: 30 },
    });
  })

  // ==================== Data Export ====================
  .get("/export", async (c) => {
    const session = c.get("session");
    const userId = session.userId;

    const [
      user,
      actors,
      publishingSchedules,
      businessProfiles,
      subscriptions,
      payments,
      notifications,
      tickets,
      apiKeys,
      notificationPreferences,
      loginHistory,
      onboarding,
      policyAcceptances,
      keywordWatches,
      keywordSearches,
      usageRecords,
      billingAddress,
      newsletterSubscriptions,
      activityHistory,
    ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          bio: true,
          role: true,
          emailVerified: true,
          termsAcceptedAt: true,
          privacyAcceptedAt: true,
          termsVersion: true,
          privacyVersion: true,
          deletionRequestedAt: true,
          deletionScheduledFor: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.actor.findMany({
        where: { userId },
        include: {
          snapshots: true,
          copyVariants: true,
          pricingHistory: true,
          usageDaily: true,
          issues: { include: { events: true } },
          externalCosts: true,
          telemetryRuns: true,
          runRule: true,
          gateUsers: true,
          gateAdmissions: true,
          intelligenceKey: { select: { prefix: true, createdAt: true, lastUsedAt: true } },
        },
      }),
      db.bulkPublishSchedule.findMany({
        where: { userId },
        include: { actors: true, runs: true },
        orderBy: { createdAt: "asc" },
      }),
      db.businessProfile.findMany({
        where: { userId },
        include: { storeWatches: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      }),
      db.subscription.findMany({ where: { userId } }),
      db.payment.findMany({ where: { userId } }),
      db.notification.findMany({ where: { userId } }),
      db.ticket.findMany({ where: { userId }, include: { messages: true } }),
      db.apiKey.findMany({
        where: { userId },
        select: {
          id: true,
          businessProfileId: true,
          name: true,
          keyPreview: true,
          scopes: true,
          actorIds: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
          rotatedAt: true,
          createdAt: true,
        },
      }),
      db.notificationPreference.findMany({ where: { userId } }),
      db.loginEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      db.onboardingState.findMany({ where: { userId } }),
      db.policyAcceptance.findMany({ where: { userId }, orderBy: { acceptedAt: "asc" } }),
      db.keywordWatch.findMany({ where: { userId } }),
      db.keywordSearch.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      db.usageRecord.findMany({ where: { userId } }),
      db.billingAddress.findUnique({ where: { userId } }),
      db.newsletterSubscriber.findMany({
        where: { OR: [{ userId }, { email: session.email }] },
      }),
      db.auditLog.findMany({
        where: { actorId: userId },
        select: { id: true, action: true, resource: true, source: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const data = {
      schema: { name: "actorconsole-user-export", version: 2 },
      exportedAt: new Date().toISOString(),
      user,
      actors,
      publishingSchedules,
      businessProfiles,
      subscriptions,
      payments,
      notifications,
      tickets,
      apiKeys,
      notificationPreferences,
      loginHistory,
      onboarding,
      policyAcceptances,
      keywordWatches,
      keywordSearches,
      usageRecords,
      billingAddress,
      newsletterSubscriptions,
      activityHistory,
    };

    const json = JSON.stringify(
      data,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    );
    c.header("Content-Type", "application/json");
    c.header(
      "Content-Disposition",
      `attachment; filename="actorconsole-export-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return c.body(json);
  })

  // ==================== Sessions ====================
  .get("/sessions", async (c) => {
    const session = c.get("session");
    const sessions = await db.session.findMany({
      where: { userId: session.userId },
      select: { id: true, expires: true, createdAt: true },
      orderBy: { expires: "desc" },
    });
    return c.json({ ok: true, data: sessions });
  })

  .delete("/sessions/:id", async (c) => {
    const session = c.get("session");
    const id = c.req.param("id");
    const result = await db.session.deleteMany({ where: { id, userId: session.userId } });
    if (result.count === 0) {
      throw new AppError("not_found", "Session not found", 404);
    }
    trackEvent("session.revoked", { userId: session.userId });
    return c.json({ ok: true, data: { id } });
  })

  // ==================== MCP Credentials ====================
  .get("/api-keys", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    const page = integerQuery(c.req.query("page"), {
      name: "page",
      defaultValue: 1,
      max: 100_000,
    });
    const limit = limitQuery(c.req.query("limit"), 25, 500);
    const where = {
      userId: session.userId,
      businessProfileId: session.businessProfileId,
    };
    const [keys, total, activeCount] = await Promise.all([
      db.apiKey.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          keyPreview: true,
          scopes: true,
          actorIds: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
          rotatedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      db.apiKey.count({ where }),
      db.apiKey.count({
        where: {
          ...where,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ]);
    return c.json({
      ok: true,
      data: {
        items: keys.map((key) => ({
          ...key,
          keyPreview: key.keyPreview ?? "Legacy key",
          scopes: stringArrayFromJson(key.scopes),
          permissions: capabilityArrayFromJson(key.scopes),
          actorIds: stringArrayFromJson(key.actorIds),
        })),
        total,
        page,
        limit,
        activeCount,
      },
    });
  })

  .post(
    "/api-keys",
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(100),
        actorIds: z.array(z.string().min(1).max(200)).max(100).default([]),
        permissions: z
          .array(z.enum(MCP_CAPABILITIES))
          .min(1)
          .max(MCP_CAPABILITIES.length)
          .default([...MCP_CAPABILITIES]),
        expiresAt: z
          .string()
          .datetime()
          .refine((value) => new Date(value) > new Date(), {
            message: "Expiration must be in the future",
          })
          .optional(),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      if (!session.businessProfileId) {
        throw new AppError("workspace_required", "Select a workspace first", 409);
      }
      await assertPlanFeature(session, "mcp_access");
      const { name, expiresAt, actorIds, permissions } = c.req.valid("json");
      const scopes = ["mcp", ...permissions] as const;
      if (actorIds.length > 0) {
        const count = await db.actor.count({
          where: {
            userId: session.userId,
            ...businessProfileScope(session),
            apifyActorId: { in: actorIds },
          },
        });
        if (count !== new Set(actorIds).size) {
          throw new AppError(
            "invalid_actor_scope",
            "Every scoped actor must belong to your workspace",
            400,
          );
        }
      }
      const rate = await checkRateLimit(
        `api-keys:create:${session.userId}:${session.businessProfileId}`,
        {
          windowMs: 3600000,
          max: 10,
        },
      );
      if (!rate.allowed) {
        return c.json(
          {
            ok: false,
            error: {
              code: "rate_limited",
              message: "Too many MCP credentials created. Max 10 per hour.",
            },
          },
          429,
        );
      }
      const activeKeyCount = await db.apiKey.count({
        where: {
          userId: session.userId,
          businessProfileId: session.businessProfileId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (activeKeyCount >= MAX_ACTIVE_API_KEYS_PER_WORKSPACE) {
        throw new AppError(
          "api_key_limit_reached",
          `A maximum of ${MAX_ACTIVE_API_KEYS_PER_WORKSPACE} active MCP credentials is allowed per workspace`,
          409,
        );
      }
      const rawKey = `al_${randomBytes(32).toString("hex")}`;
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      const key = await db.apiKey.create({
        data: {
          userId: session.userId,
          businessProfileId: session.businessProfileId,
          name,
          keyHash,
          keyPreview: `…${rawKey.slice(-4)}`,
          scopes: [...scopes],
          actorIds,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });
      trackEvent("api_key.created", { userId: session.userId, properties: { name } });
      await recordUserAudit(c, session, "api-key.created", `api-key:${key.id}`, {
        name,
        expiresAt: key.expiresAt,
      });
      return c.json(
        {
          ok: true,
          data: {
            id: key.id,
            name: key.name,
            key: rawKey, // Only returned once
            keyPreview: key.keyPreview,
            scopes: [...scopes],
            permissions,
            actorIds,
            expiresAt: key.expiresAt,
            revokedAt: key.revokedAt,
            rotatedAt: key.rotatedAt,
            createdAt: key.createdAt,
          },
        },
        201,
      );
    },
  )

  .patch(
    "/api-keys/:id",
    zValidator(
      "json",
      z.object({
        name: z.string().trim().min(1).max(100),
        actorIds: z.array(z.string().min(1).max(200)).max(100).default([]),
        permissions: z
          .array(z.enum(MCP_CAPABILITIES))
          .min(1)
          .max(MCP_CAPABILITIES.length)
          .optional(),
        expiresAt: z
          .string()
          .datetime()
          .refine((value) => new Date(value) > new Date(), {
            message: "Expiration must be in the future",
          })
          .nullable()
          .optional(),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      if (!session.businessProfileId) {
        throw new AppError("workspace_required", "Select a workspace first", 409);
      }
      await assertPlanFeature(session, "mcp_access");
      const id = c.req.param("id");
      const { name, actorIds, expiresAt, permissions } = c.req.valid("json");
      const existing = await db.apiKey.findFirst({
        where: {
          id,
          userId: session.userId,
          businessProfileId: session.businessProfileId,
          revokedAt: null,
        },
      });
      if (!existing) throw new AppError("not_found", "Active MCP credential not found", 404);

      if (actorIds.length > 0) {
        const count = await db.actor.count({
          where: {
            userId: session.userId,
            ...businessProfileScope(session),
            apifyActorId: { in: actorIds },
          },
        });
        if (count !== new Set(actorIds).size) {
          throw new AppError(
            "invalid_actor_scope",
            "Every scoped actor must belong to your workspace",
            400,
          );
        }
      }

      const key = await db.apiKey.update({
        where: { id: existing.id },
        data: {
          name,
          actorIds,
          ...(permissions ? { scopes: ["mcp", ...permissions] } : {}),
          ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
        },
      });
      await recordUserAudit(c, session, "api-key.updated", `api-key:${id}`, {
        name,
        actorIds,
        permissions: permissions ?? capabilityArrayFromJson(existing.scopes),
        expiresAt: expiresAt === undefined ? existing.expiresAt : expiresAt,
      });
      return c.json({
        ok: true,
        data: {
          id: key.id,
          name: key.name,
          keyPreview: key.keyPreview ?? "Legacy key",
          scopes: stringArrayFromJson(key.scopes),
          permissions: capabilityArrayFromJson(key.scopes),
          actorIds: stringArrayFromJson(key.actorIds),
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          revokedAt: key.revokedAt,
          rotatedAt: key.rotatedAt,
          createdAt: key.createdAt,
        },
      });
    },
  )

  .post("/api-keys/:id/rotate", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    await assertPlanFeature(session, "mcp_access");
    const id = c.req.param("id");
    const existing = await db.apiKey.findFirst({
      where: {
        id,
        userId: session.userId,
        businessProfileId: session.businessProfileId,
        revokedAt: null,
      },
    });
    if (!existing) throw new AppError("not_found", "Active MCP credential not found", 404);
    const rate = await checkRateLimit(
      `api-keys:rotate:${session.userId}:${session.businessProfileId}`,
      { windowMs: 3_600_000, max: 10 },
    );
    if (!rate.allowed) {
      throw new AppError(
        "rate_limited",
        "Too many MCP credential rotations. Try again later.",
        429,
      );
    }
    const rawKey = `al_${randomBytes(32).toString("hex")}`;
    const now = new Date();
    const expiresAt =
      existing.expiresAt && existing.expiresAt > now
        ? existing.expiresAt
        : new Date(now.getTime() + 90 * 86_400_000);
    const key = await db.apiKey.update({
      where: { id: existing.id },
      data: {
        keyHash: createHash("sha256").update(rawKey).digest("hex"),
        keyPreview: `…${rawKey.slice(-4)}`,
        lastUsedAt: null,
        expiresAt,
        rotatedAt: now,
      },
    });
    trackEvent("api_key.rotated", { userId: session.userId });
    await recordUserAudit(c, session, "api-key.rotated", `api-key:${id}`);
    return c.json({
      ok: true,
      data: {
        id: key.id,
        key: rawKey,
        keyPreview: key.keyPreview,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        rotatedAt: key.rotatedAt,
      },
    });
  })

  .delete("/api-keys/:id", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    const id = c.req.param("id");
    const result = await db.apiKey.updateMany({
      where: {
        id,
        userId: session.userId,
        businessProfileId: session.businessProfileId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new AppError("not_found", "MCP credential not found", 404);
    }
    trackEvent("api_key.revoked", { userId: session.userId });
    await recordUserAudit(c, session, "api-key.revoked", `api-key:${id}`);
    return c.json({ ok: true, data: { id } });
  })

  // ==================== Notification Preferences ====================
  .get("/notification-preferences", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    let prefs = await db.notificationPreference.findUnique({
      where: { businessProfileId: session.businessProfileId },
    });
    if (!prefs) {
      prefs = await db.notificationPreference.create({
        data: { userId: session.userId, businessProfileId: session.businessProfileId },
      });
    }
    return c.json({ ok: true, data: prefs });
  })

  .put(
    "/notification-preferences",
    zValidator(
      "json",
      z.object({
        marketing: z.boolean().optional(),
        product: z.boolean().optional(),
        billing: z.boolean().optional(),
        security: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      if (!session.businessProfileId) {
        throw new AppError("workspace_required", "Select a workspace first", 409);
      }
      const body = c.req.valid("json");
      const prefs = await db.notificationPreference.upsert({
        where: { businessProfileId: session.businessProfileId },
        create: {
          userId: session.userId,
          businessProfileId: session.businessProfileId,
          ...body,
        },
        update: body,
      });
      return c.json({ ok: true, data: prefs });
    },
  )

  // ==================== Billing Address ====================
  .get("/billing-address", async (c) => {
    const session = c.get("session");
    const addr = await db.billingAddress.findUnique({
      where: { userId: session.userId },
    });
    return c.json({ ok: true, data: addr ?? {} });
  })

  .put(
    "/billing-address",
    zValidator(
      "json",
      z.object({
        company: z.string().max(200).optional().nullable(),
        gstin: z.string().max(50).optional().nullable(),
        address: z.string().max(500).optional().nullable(),
        city: z.string().max(100).optional().nullable(),
        state: z.string().max(100).optional().nullable(),
        zip: z.string().max(20).optional().nullable(),
        country: z.string().max(100).optional().default("IN"),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      const body = c.req.valid("json");
      const addr = await db.billingAddress.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, ...body },
        update: body,
      });
      return c.json({ ok: true, data: addr });
    },
  )

  // ==================== Login History ====================
  .get("/login-history", async (c) => {
    const session = c.get("session");
    const limit = limitQuery(c.req.query("limit"), 50, 100);
    const events = await db.loginEvent.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return c.json({ ok: true, data: events });
  })

  // ==================== Onboarding ====================
  .get("/onboarding", async (c) => {
    const session = c.get("session");
    if (!session.businessProfileId) {
      return c.json({
        ok: true,
        data: {
          workspace: null,
          state: null,
          currentStep: "workspace",
          plan: session.plan,
          credentials: {
            apiKeyConfigured: false,
            uiTokenConfigured: false,
            cookiesConfigured: false,
          },
        },
      });
    }

    let state = await db.onboardingState.findUnique({
      where: { businessProfileId: session.businessProfileId },
    });
    if (!state) {
      state = await db.onboardingState.create({
        data: {
          userId: session.userId,
          businessProfileId: session.businessProfileId,
          profileComplete: true,
        },
      });
    }
    // A workspace that already has the Pro entitlement has no plan decision
    // left to make. Complete this legacy/incomplete step server-side so every
    // client, including the onboarding gate, receives the authoritative state.
    if (session.plan === "PRO" && !state.planStepCompletedAt) {
      const now = new Date();
      state = await db.onboardingState.update({
        where: { businessProfileId: session.businessProfileId },
        data: {
          planStepCompletedAt: now,
          ...(state.credentialsStepCompletedAt ? { completedAt: state.completedAt ?? now } : {}),
        },
      });
    }
    if (!state.completedAt && state.credentialsStepCompletedAt && state.planStepCompletedAt) {
      state = await db.onboardingState.update({
        where: { businessProfileId: session.businessProfileId },
        data: { completedAt: new Date() },
      });
    }
    const [workspace, credentials] = await Promise.all([
      db.businessProfile.findFirst({
        where: { id: session.businessProfileId, userId: session.userId },
        select: { id: true, name: true, slug: true, industry: true, website: true },
      }),
      db.apifyToken.findUnique({
        where: { businessProfileId: session.businessProfileId },
        select: {
          encryptedToken: true,
          encryptedUiToken: true,
          encryptedCookies: true,
          apiTokenStatus: true,
          uiTokenStatus: true,
          cookiesStatus: true,
        },
      }),
    ]);
    const currentStep = state.completedAt
      ? "complete"
      : !state.credentialsStepCompletedAt
        ? "credentials"
        : !state.planStepCompletedAt
          ? "plan"
          : "complete";
    return c.json({
      ok: true,
      data: {
        ...state,
        state,
        workspace,
        currentStep,
        plan: session.plan,
        credentials: {
          apiKeyConfigured: Boolean(credentials?.encryptedToken),
          uiTokenConfigured: Boolean(credentials?.encryptedUiToken),
          cookiesConfigured: Boolean(credentials?.encryptedCookies),
          apiTokenStatus: credentials?.apiTokenStatus ?? "NOT_CONFIGURED",
          uiTokenStatus: credentials?.uiTokenStatus ?? "NOT_CONFIGURED",
          cookiesStatus: credentials?.cookiesStatus ?? "NOT_CONFIGURED",
          mode: state.credentialMode,
        },
      },
    });
  })

  .put(
    "/onboarding",
    zValidator(
      "json",
      z.discriminatedUnion("step", [
        z.object({ step: z.literal("credentials") }).strict(),
        z.object({ step: z.literal("plan") }).strict(),
      ]),
    ),
    async (c) => {
      const session = c.get("session");
      if (!session.businessProfileId) {
        throw new AppError("workspace_required", "Create a workspace first", 409);
      }
      const body = c.req.valid("json");
      const current = await db.onboardingState.findUnique({
        where: { businessProfileId: session.businessProfileId },
      });
      const now = new Date();
      const credentialsStepCompletedAt =
        body.step === "credentials" ? now : current?.credentialsStepCompletedAt;
      const planStepCompletedAt = body.step === "plan" ? now : current?.planStepCompletedAt;
      const completedAt =
        credentialsStepCompletedAt && planStepCompletedAt
          ? (current?.completedAt ?? now)
          : current?.completedAt;
      const data = {
        ...(body.step === "credentials"
          ? {
              credentialsStepCompletedAt: now,
              credentialMode: current?.credentialMode ?? "LIMITED",
            }
          : {}),
        ...(body.step === "plan" ? { planStepCompletedAt: now } : {}),
        ...(completedAt ? { completedAt } : {}),
      };
      const state = await db.onboardingState.upsert({
        where: { businessProfileId: session.businessProfileId },
        create: {
          userId: session.userId,
          businessProfileId: session.businessProfileId,
          profileComplete: true,
          ...data,
        },
        update: data,
      });
      const currentStep = state.completedAt
        ? "complete"
        : !state.credentialsStepCompletedAt
          ? "credentials"
          : "plan";
      return c.json({ ok: true, data: { ...state, state, currentStep, plan: session.plan } });
    },
  );
