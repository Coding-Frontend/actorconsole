import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@actorconsole/db";
import {
  getUserApifyClient,
  revokeApifyToken,
  saveApifyToken,
  validateUserApifyAccountMatch,
  ApifyClientError,
} from "@actorconsole/apify";
import { AppError } from "../middleware/error.js";
import { trackEvent } from "../lib/analytics";
import { assertFeatureEnabled, isFeatureEnabled } from "../lib/plan-access.js";
import type { AppEnv } from "../app.js";
import {
  getLogger,
  incrementMetric,
  selectActiveApifyConsoleCredential,
} from "@actorconsole/shared";

const APIFY_READ_TIMEOUT_MS = 5_000;
const EXTENSION_HANDOFF_TTL_MS = 5 * 60 * 1_000;
const UNHEALTHY_CREDENTIAL_STATUSES = new Set(["EXPIRED", "INVALID", "ERROR"]);

function credentialAvailable(configured: boolean, status: string | null | undefined): boolean {
  return Boolean(
    configured &&
    status !== "NOT_CONFIGURED" &&
    !UNHEALTHY_CREDENTIAL_STATUSES.has(String(status ?? "").toUpperCase()),
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = APIFY_READ_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Apify request timed out")), timeoutMs);
    promise.then(
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
import { businessProfileScope } from "../lib/business-profile.js";

const log = getLogger("api:apify");

const connectSchema = z
  .object({
    token: z.string().trim().min(20, "Apify API keys are at least 20 characters").optional(),
    uiToken: z.string().trim().min(20, "Apify UI tokens are at least 20 characters").optional(),
    cookies: z.string().trim().min(1, "Apify cookies cannot be empty").optional(),
  })
  .superRefine(({ token, uiToken, cookies }, ctx) => {
    if (uiToken && cookies) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cookies"],
        message: "Choose either an Apify UI key or cookies, not both",
      });
    }
    if (!token && !uiToken && !cookies) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["token"],
        message: "Provide at least one Apify credential, or skip this onboarding step",
      });
    }
  });

const extensionCompleteSchema = z.object({
  challenge: z.string().min(32).max(256),
  expectedApifyUserId: z.string().regex(/^[A-Za-z0-9]{8,64}$/),
  apifyRt: z
    .string()
    .min(1, "The ApifyRT cookie is empty")
    .max(8_192, "The ApifyRT cookie is too large")
    .regex(/^[^\s;,]+$/, "The ApifyRT cookie has an invalid format"),
});

const extensionAccountSchema = z.object({
  apifyAccountId: z.string().regex(/^[A-Za-z0-9]{8,64}$/).optional(),
  apifyAccountType: z.enum(["PERSONAL", "ORGANIZATION"]).optional(),
}).refine(
  (value) => Boolean(value.apifyAccountId) === Boolean(value.apifyAccountType),
  "Choose both an Apify account and its type",
);

function hashExtensionChallenge(challenge: string): string {
  return createHash("sha256").update(challenge).digest("hex");
}

function challengeMatches(challenge: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashExtensionChallenge(challenge), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function recordExtensionResult(result: string): void {
  incrementMetric("actorconsole_apify_extension_handoffs_total", { result });
}

export const apifyRoutes = new Hono<AppEnv>()
  // POST /apify/extension/session — create a short-lived, workspace-bound
  // challenge. No Apify credential is stored in the handoff record.
  .post("/extension/session", async (c) => {
    const session = c.get("session");
    await assertFeatureEnabled("apify_chrome_extension", session.userId);
    const requestedAccount = extensionAccountSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!requestedAccount.success) {
      throw new AppError("invalid_apify_account", "Choose a valid Apify personal account or organization", 400);
    }
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }

    const workspace = await db.businessProfile.findFirst({
      where: { id: session.businessProfileId, userId: session.userId },
      select: { id: true, name: true },
    });
    if (!workspace) {
      throw new AppError("workspace_not_found", "The selected workspace could not be found", 404);
    }

    const now = new Date();
    await db.apifyExtensionSession.deleteMany({
      where: {
        userId: session.userId,
        OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }],
      },
    });

    const challenge = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + EXTENSION_HANDOFF_TTL_MS);
    const handoff = await db.apifyExtensionSession.create({
      data: {
        userId: session.userId,
        businessProfileId: workspace.id,
        apifyAccountId: requestedAccount.data.apifyAccountId ?? null,
        apifyAccountType: requestedAccount.data.apifyAccountType ?? null,
        challengeHash: hashExtensionChallenge(challenge),
        expiresAt,
      },
      select: { id: true },
    });

    recordExtensionResult("started");
    trackEvent("apify.extension_handoff.started", {
      userId: session.userId,
      properties: { businessProfileId: workspace.id },
    });
    return c.json({
      ok: true,
      data: {
        handoffId: handoff.id,
        challenge,
        expiresAt: expiresAt.toISOString(),
        workspace,
        account: requestedAccount.data.apifyAccountId
          ? {
              id: requestedAccount.data.apifyAccountId,
              type: requestedAccount.data.apifyAccountType,
            }
          : null,
      },
    });
  })

  // POST /apify/extension/session/:handoffId/complete — consume a challenge
  // exactly once, validate the single ApifyRT value, and persist it through
  // the existing encrypted workspace credential path.
  .post(
    "/extension/session/:handoffId/complete",
    zValidator("json", extensionCompleteSchema),
    async (c) => {
      const session = c.get("session");
      await assertFeatureEnabled("apify_chrome_extension", session.userId);
      if (!session.businessProfileId) {
        throw new AppError("workspace_required", "Select a workspace first", 409);
      }

      const handoffId = c.req.param("handoffId");
      const { challenge, apifyRt, expectedApifyUserId } = c.req.valid("json");
      const handoff = await db.apifyExtensionSession.findUnique({ where: { id: handoffId } });
      if (
        !handoff ||
        handoff.userId !== session.userId ||
        handoff.businessProfileId !== session.businessProfileId
      ) {
        recordExtensionResult("workspace_mismatch");
        throw new AppError(
          "apify_extension_session_not_found",
          "This extension connection does not belong to the selected workspace",
          404,
        );
      }
      if (handoff.consumedAt) {
        recordExtensionResult("reused");
        throw new AppError(
          "apify_extension_session_used",
          "This extension connection has already been used. Start a new connection.",
          409,
        );
      }
      if (handoff.expiresAt <= new Date()) {
        recordExtensionResult("expired");
        throw new AppError(
          "apify_extension_session_expired",
          "This extension connection expired. Start a new connection.",
          409,
        );
      }
      if (!challengeMatches(challenge, handoff.challengeHash)) {
        recordExtensionResult("invalid_challenge");
        throw new AppError(
          "apify_extension_challenge_invalid",
          "The extension connection challenge is invalid",
          403,
        );
      }

      const device = handoff.deviceId
        ? await db.apifyExtensionDevice.findUnique({ where: { id: handoff.deviceId } })
        : null;
      if (
        !device ||
        device.userId !== session.userId ||
        device.revokedAt ||
        device.expiresAt <= new Date()
      ) {
        throw new AppError(
          "apify_extension_not_paired",
          "Pair this Chrome extension with the signed-in ActorConsole account first",
          403,
        );
      }

      const consumedAt = new Date();
      const claimed = await db.apifyExtensionSession.updateMany({
        where: {
          id: handoff.id,
          userId: session.userId,
          businessProfileId: session.businessProfileId,
          consumedAt: null,
          expiresAt: { gt: consumedAt },
        },
        data: { consumedAt },
      });
      if (claimed.count !== 1) {
        recordExtensionResult("race_lost");
        throw new AppError(
          "apify_extension_session_used",
          "This extension connection is no longer available. Start a new connection.",
          409,
        );
      }

      try {
        const saved = await saveApifyToken(
          session.userId,
          undefined,
          session.businessProfileId,
          undefined,
          `ApifyRT=${apifyRt}`,
          expectedApifyUserId,
          handoff.apifyAccountId ?? expectedApifyUserId,
          handoff.apifyAccountType === "ORGANIZATION" ? "ORGANIZATION" : "PERSONAL",
        );
        await db.onboardingState.upsert({
          where: { businessProfileId: session.businessProfileId },
          create: {
            userId: session.userId,
            businessProfileId: session.businessProfileId,
            apifyConnected: true,
            credentialMode: credentialMode(saved),
          } as never,
          update: {
            apifyConnected: true,
            credentialMode: credentialMode(saved),
          },
        });
        recordExtensionResult("completed");
        trackEvent("apify.extension_handoff.completed", {
          userId: session.userId,
          properties: {
            businessProfileId: session.businessProfileId,
            apiKeyConfigured: saved.apiKeyConfigured,
          },
        });
        return c.json({
          ok: true,
          data: {
            connected: true,
            ...saved,
            accountType: handoff.apifyAccountType === "ORGANIZATION" ? "ORGANIZATION" : "PERSONAL",
            credentialMode: credentialMode(saved),
            publishingAuthConfigured: true,
          },
        });
      } catch (error) {
        const reason =
          error instanceof ApifyClientError && error.status === 409
            ? "account_mismatch"
            : error instanceof ApifyClientError && error.code === "unauthorized"
              ? "cookie_rejected"
              : "validation_failed";
        recordExtensionResult(reason);
        trackEvent("apify.extension_handoff.failed", {
          userId: session.userId,
          properties: { businessProfileId: session.businessProfileId, reason },
        });
        log.warn(
          { userId: session.userId, businessProfileId: session.businessProfileId, reason },
          "Apify extension handoff failed validation",
        );
        if (error instanceof ApifyClientError && error.status === 409) {
          throw new AppError("apify_extension_account_mismatch", error.message, 409);
        }
        throw new AppError(
          "apify_extension_cookie_rejected",
          error instanceof ApifyClientError
            ? error.message
            : "Apify rejected the browser session. Sign in to Apify Console and try again.",
          error instanceof ApifyClientError && error.status === 401 ? 401 : 422,
        );
      }
    },
  )

  // POST /apify/connect — validate + encrypt + store the user's Apify credentials
  .post("/connect", zValidator("json", connectSchema), async (c) => {
    const session = c.get("session");
    const { token, uiToken, cookies } = c.req.valid("json");
    try {
      const saved = await saveApifyToken(
        session.userId,
        token,
        session.businessProfileId,
        uiToken,
        cookies,
      );
      await db.onboardingState.upsert({
        where: session.businessProfileId
          ? { businessProfileId: session.businessProfileId }
          : ({ userId: session.userId } as never),
        // The onboarding flag represents any saved Apify connection. The
        // credentialMode field carries the distinction between API and
        // Console-only capabilities.
        create: {
          userId: session.userId,
          ...(session.businessProfileId ? { businessProfileId: session.businessProfileId } : {}),
          apifyConnected: true,
          credentialMode: credentialMode(saved),
        } as never,
        update: { apifyConnected: true, credentialMode: credentialMode(saved) },
      });
      trackEvent("apify.connect", {
        userId: session.userId,
        properties: {
          apifyUserId: saved.apifyUserId,
          apiKeyConfigured: saved.apiKeyConfigured,
          publishingAuthConfigured: saved.uiTokenConfigured || saved.cookiesConfigured,
        },
      });
      let insightSyncJobId: string | null = null;
      if (saved.apiKeyConfigured && session.businessProfileId) {
        await db.apifyToken.updateMany({
          where: { businessProfileId: session.businessProfileId },
          data: { insightsBootstrapPending: true, insightsBootstrapError: null },
        });
        try {
          const { enqueue } = await import("../lib/queue.js");
          insightSyncJobId = await enqueue("snapshots", {
            workspaceBootstrap: {
              userId: session.userId,
              businessProfileId: session.businessProfileId,
            },
          });
        } catch (queueError) {
          // Credential persistence must remain successful if the background
          // queue is temporarily unavailable; the daily scheduler will retry.
          log.warn(
            { queueError, userId: session.userId },
            "Could not queue initial Actor insight sync",
          );
        }
      }
      return c.json({
        ok: true,
        data: {
          connected: true,
          ...saved,
          credentialMode: credentialMode(saved),
          publishingAuthConfigured: saved.uiTokenConfigured || saved.cookiesConfigured,
          insightSyncQueued: Boolean(insightSyncJobId),
          insightSyncPending: saved.apiKeyConfigured && Boolean(session.businessProfileId),
          insightSyncJobId,
        },
      });
    } catch (err) {
      log.warn({ err, userId: session.userId }, "Apify connection failed");
      throw new AppError(
        "apify_connect_failed",
        err instanceof ApifyClientError
          ? err.message
          : "Failed to connect Apify. Verify the token and try again.",
        400,
      );
    }
  })

  // GET /apify/status — connection status + Apify user info
  .get("/status", async (c) => {
    const session = c.get("session");
    const extensionEnabled = await isFeatureEnabled("apify_chrome_extension", session.userId);
    const token = session.businessProfileId
      ? await db.apifyToken.findUnique({ where: { businessProfileId: session.businessProfileId } })
      : await db.apifyToken.findFirst({
          where: { userId: session.userId },
          orderBy: { updatedAt: "desc" },
        });
    if (!token) return c.json({ ok: true, data: { connected: false, extensionEnabled } });

    const statusData = (
      current: typeof token,
      live?: { username?: string | null; plan?: string | null; error?: string | null },
    ) => {
      const activeConsoleCredential = selectActiveApifyConsoleCredential({
        uiConfigured: Boolean(current.encryptedUiToken),
        uiTestStatus: current.uiTokenStatus,
        cookiesConfigured: Boolean(current.encryptedCookies),
        cookiesTestStatus: current.cookiesStatus,
      });
      const activeConsoleStatus =
        activeConsoleCredential === "apify_ui_token"
          ? current.uiTokenStatus
          : activeConsoleCredential === "apify_cookies"
            ? current.cookiesStatus
            : null;
      return {
        connected: true,
        apiKeyConfigured: Boolean(current.encryptedToken),
        apifyUserId: current.apifyUserId,
        accountType: current.consoleUserId && current.apifyUserId
          ? current.consoleUserId === current.apifyUserId ? "PERSONAL" : "ORGANIZATION"
          : null,
        username: live?.username ?? current.apifyUsername,
        plan: live?.plan ?? null,
        uiTokenConfigured: Boolean(current.encryptedUiToken),
        cookiesConfigured: Boolean(current.encryptedCookies),
        activeConsoleCredential:
          activeConsoleCredential === "apify_ui_token"
            ? ("uiToken" as const)
            : activeConsoleCredential === "apify_cookies"
              ? ("cookies" as const)
              : null,
        insightSyncPending: current.insightsBootstrapPending,
        insightSyncError: current.insightsBootstrapError,
        publishingAuthConfigured: Boolean(current.encryptedUiToken || current.encryptedCookies),
        connectedAt: current.createdAt,
        apiTokenStatus: current.apiTokenStatus,
        uiTokenStatus: current.uiTokenStatus,
        cookiesStatus: current.cookiesStatus,
        validatedAt: current.validatedAt,
        validationError: current.validationError,
        apiOperationsAvailable: credentialAvailable(
          Boolean(current.encryptedToken),
          current.apiTokenStatus,
        ),
        consoleOperationsAvailable: credentialAvailable(
          Boolean(activeConsoleCredential),
          activeConsoleStatus,
        ),
        actorPublishingAvailable: credentialAvailable(
          Boolean(current.encryptedToken),
          current.apiTokenStatus,
        ),
        ...(live?.error ? { error: live.error } : {}),
        credentialMode: credentialMode({
          apiKeyConfigured: Boolean(current.encryptedToken),
          uiTokenConfigured: Boolean(current.encryptedUiToken),
          cookiesConfigured: Boolean(current.encryptedCookies),
        }),
        extensionEnabled,
      };
    };

    // Dashboard reads must be database-first. Live validation is intentionally
    // opt-in so server-rendered pages never block on Apify network latency.
    if (c.req.query("validate") !== "true") {
      return c.json({
        ok: true,
        data: statusData(token),
      });
    }

    const apify = session.businessProfileId
      ? await getUserApifyClient(session.userId, session.businessProfileId)
      : await getUserApifyClient(session.userId);
    if (!apify) {
      const current = (await db.apifyToken.findUnique({ where: { id: token.id } })) ?? token;
      return c.json({
        ok: true,
        data: statusData(current, {
          error: "Stored Apify credentials could not be used. Update the affected credential.",
        }),
      });
    }

    const [apiValidation, consoleValidation] = await Promise.allSettled([
      token.encryptedToken ? withTimeout(apify.validateApiAuthentication()) : Promise.resolve(null),
      token.encryptedUiToken || token.encryptedCookies
        ? withTimeout(apify.validateConsoleAuthentication({ verifyOrganizations: true }))
        : Promise.resolve(null),
    ]);
    let accountMatch: PromiseSettledResult<Awaited<ReturnType<typeof validateUserApifyAccountMatch>>> | null = null;
    if (token.encryptedCookies && consoleValidation.status === "fulfilled") {
      const [result] = await Promise.allSettled([
        withTimeout(validateUserApifyAccountMatch(session.userId, session.businessProfileId)),
      ]);
      accountMatch = result ?? null;
    }
    const current = (await db.apifyToken.findUnique({ where: { id: token.id } })) ?? token;
    const me = apiValidation.status === "fulfilled" ? apiValidation.value : null;
    const failedSurfaces = [
      token.encryptedToken && apiValidation.status === "rejected" ? "API key" : null,
      (token.encryptedUiToken || token.encryptedCookies) && consoleValidation.status === "rejected"
        ? "Console credential"
        : null,
      accountMatch?.status === "rejected" ||
      (accountMatch?.status === "fulfilled" && accountMatch.value?.matches === false)
        ? "Console account access"
        : null,
    ].filter(Boolean);

    return c.json({
      ok: true,
      data: statusData(current, {
        username: me?.username ?? current.apifyUsername,
        plan: me?.plan?.id ?? null,
        error:
          failedSurfaces.length > 0
            ? `${failedSurfaces.join(" and ")} could not be validated. Update only the affected credential.`
            : null,
      }),
    });
  })

  // GET /apify/operations — independent read-only summaries of the Apify
  // Console sections unlocked by the active workspace credentials.
  .get("/operations", async (c) => {
    const session = c.get("session");
    const token = session.businessProfileId
      ? await db.apifyToken.findUnique({ where: { businessProfileId: session.businessProfileId } })
      : await db.apifyToken.findFirst({
          where: { userId: session.userId },
          orderBy: { updatedAt: "desc" },
        });
    if (!token) {
      return c.json({
        ok: true,
        data: { connected: false, api: null, console: null },
      });
    }

    const apify = session.businessProfileId
      ? await getUserApifyClient(session.userId, session.businessProfileId)
      : await getUserApifyClient(session.userId);
    if (!apify) {
      return c.json({
        ok: true,
        data: {
          connected: true,
          api: token.encryptedToken ? { configured: true, available: false } : null,
          console:
            token.encryptedUiToken || token.encryptedCookies
              ? { configured: true, available: false }
              : null,
        },
      });
    }

    const apiConfigured = Boolean(token.encryptedToken);
    const consoleConfigured = Boolean(token.encryptedUiToken || token.encryptedCookies);
    const [inventory, organizations, proxyCycles, currentServices, notifications] =
      await Promise.allSettled([
        apiConfigured ? withTimeout(apify.getResourceInventory()) : Promise.resolve(null),
        consoleConfigured ? withTimeout(apify.listConsoleOrganizations()) : Promise.resolve(null),
        consoleConfigured ? withTimeout(apify.listProxyUsageCycles()) : Promise.resolve(null),
        consoleConfigured
          ? withTimeout(apify.getCurrentBillingCycleServiceBreakdown())
          : Promise.resolve(null),
        consoleConfigured ? withTimeout(apify.listConsoleNotifications()) : Promise.resolve(null),
      ]);

    const inventoryValue = inventory.status === "fulfilled" ? inventory.value : null;
    const inventoryAvailable = Boolean(
      inventoryValue && Object.values(inventoryValue).some((value) => value !== null),
    );
    const organizationsValue = organizations.status === "fulfilled" ? organizations.value : null;
    const proxyCyclesValue = proxyCycles.status === "fulfilled" ? proxyCycles.value : null;
    const currentServicesValue =
      currentServices.status === "fulfilled" ? currentServices.value : null;
    const notificationsValue = notifications.status === "fulfilled" ? notifications.value : null;
    const serviceGroups = currentServicesValue ? Object.keys(currentServicesValue).length : null;

    return c.json({
      ok: true,
      data: {
        connected: true,
        api: apiConfigured
          ? {
              configured: true,
              available: inventoryAvailable,
              inventory: inventoryValue,
            }
          : null,
        console: consoleConfigured
          ? {
              configured: true,
              available: [organizations, proxyCycles, currentServices, notifications].some(
                (result) => result.status === "fulfilled" && result.value !== null,
              ),
              sections: {
                organizations: {
                  available: organizationsValue !== null,
                  count: organizationsValue?.length ?? null,
                },
                proxy: {
                  available: proxyCyclesValue !== null,
                  billingCycles: proxyCyclesValue?.length ?? null,
                },
                billing: { available: currentServicesValue !== null, serviceGroups },
                notifications: {
                  available: notificationsValue !== null,
                  total: notificationsValue?.length ?? null,
                  unread:
                    notificationsValue?.filter(
                      (notification) => !notification.deliveryStatus?.ui?.readAt,
                    ).length ?? null,
                },
              },
            }
          : null,
      },
    });
  })

  // DELETE /apify/disconnect — remove stored token
  .delete("/disconnect", async (c) => {
    const session = c.get("session");
    if (session.businessProfileId) {
      await revokeApifyToken(session.userId, session.businessProfileId);
    } else {
      await revokeApifyToken(session.userId);
    }
    await db.onboardingState.updateMany({
      where: { userId: session.userId, ...businessProfileScope(session) },
      data: { apifyConnected: false },
    });
    return c.json({ ok: true, data: { disconnected: true } });
  });

function credentialMode(input: {
  apiKeyConfigured: boolean;
  uiTokenConfigured: boolean;
  cookiesConfigured: boolean;
}) {
  const publishing = input.uiTokenConfigured || input.cookiesConfigured;
  if (input.apiKeyConfigured && publishing) return "FULL";
  if (input.apiKeyConfigured) return "API_ONLY";
  if (publishing) return "PUBLISHING_ONLY";
  return "LIMITED";
}
