import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@actorconsole/db";
import {
  ApifyClientError,
  getUserApifyClient,
  saveApifyToken,
  validateUserApifyAccountMatch,
} from "@actorconsole/apify";
import { AppError } from "../middleware/error.js";
import { slugify } from "../lib/business-profile.js";
import { assertFeatureEnabled } from "../lib/plan-access.js";
import type { AppEnv } from "../app.js";

const TOKEN_PATTERN = /^acx_[a-f0-9]{64}$/;
const DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1_000;
const CONNECTION_CHECK_TIMEOUT_MS = 8_000;

function withCheckTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Apify check timed out")), CONNECTION_CHECK_TIMEOUT_MS);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function authenticatedDevice(c: Context<AppEnv>) {
  const token = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || !TOKEN_PATTERN.test(token)) {
    throw new AppError("extension_not_paired", "Pair the extension with ActorConsole first", 401);
  }
  const device = await db.apifyExtensionDevice.findUnique({
    where: { tokenHash: hash(token) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          image: true,
          suspendedAt: true,
          deletionScheduledFor: true,
        },
      },
    },
  });
  if (
    !device ||
    device.revokedAt ||
    device.expiresAt <= new Date() ||
    device.user.suspendedAt ||
    device.user.deletionScheduledFor
  ) {
    throw new AppError("extension_not_paired", "The ActorConsole pairing expired or was revoked", 401);
  }
  if (!device.lastUsedAt || Date.now() - device.lastUsedAt.getTime() > 5 * 60_000) {
    void db.apifyExtensionDevice.update({
      where: { id: device.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => undefined);
  }
  return device;
}

function identity(device: Awaited<ReturnType<typeof authenticatedDevice>>) {
  return {
    userId: device.user.id,
    name: device.user.name,
    username: device.user.username,
    email: device.user.email,
    image: device.user.image,
    expiresAt: device.expiresAt.toISOString(),
  };
}

export const extensionDeviceRoutes = new Hono<AppEnv>()
  // The app-wide middleware allows this route only with an interactive
  // ActorConsole web session. The extension receives a scoped credential.
  .post(
    "/pair",
    zValidator("json", z.object({
      challenge: z.string().regex(/^[a-f0-9]{64}$/),
      delivery: z.enum(["bridge", "poll"]).default("bridge"),
    })),
    async (c) => {
      const session = c.get("session");
      if (session.authMethod !== "session") {
        throw new AppError("interactive_session_required", "Sign in with your own ActorConsole account to pair the extension", 403);
      }
      const { challenge, delivery } = c.req.valid("json");
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, name: true, email: true, image: true },
      });
      if (!user) throw new AppError("user_not_found", "ActorConsole account not found", 404);
      c.header("cache-control", "no-store");
      if (delivery === "poll") {
        const existing = await db.apifyExtensionDevice.findFirst({
          where: {
            userId: user.id, pairChallengeHash: hash(challenge), claimHash: null,
            tokenHash: null, revokedAt: null, claimExpiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (existing) return c.json({ ok: true, data: {
          pairingId: existing.id, challenge, userId: user.id, name: user.name, email: user.email,
        } });
      }
      await db.apifyExtensionDevice.deleteMany({
        where: { userId: user.id, tokenHash: null, claimExpiresAt: { lt: new Date() } },
      });
      const activeCount = await db.apifyExtensionDevice.count({
        where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      if (activeCount >= 10) {
        throw new AppError("extension_device_limit", "Disconnect an existing extension first", 429);
      }
      const code = `acp_${randomBytes(32).toString("hex")}`;
      const expiresAt = new Date(Date.now() + DEVICE_TTL_MS);
      const device = await db.apifyExtensionDevice.create({
        data: {
          userId: user.id,
          claimHash: delivery === "poll" ? null : hash(code),
          pairChallengeHash: hash(challenge),
          claimExpiresAt: new Date(Date.now() + 5 * 60_000),
          expiresAt,
        },
      });
      return c.json({
        ok: true,
        data: {
          ...(delivery === "bridge" ? { code } : {}),
          pairingId: device.id, challenge, userId: user.id, name: user.name, email: user.email,
        },
      });
    },
  )
  .get("/pair/status", async (c) => {
    const device = await db.apifyExtensionDevice.findFirst({
      where: { id: c.req.query("id") ?? "", userId: c.get("session").userId },
      select: { tokenHash: true, claimExpiresAt: true, expiresAt: true, revokedAt: true },
    });
    if (!device) throw new AppError("extension_pair_not_found", "This browser connection was not found", 404);
    c.header("cache-control", "no-store");
    const expired = Boolean(device.revokedAt || device.expiresAt <= new Date() ||
      (!device.tokenHash && (!device.claimExpiresAt || device.claimExpiresAt <= new Date())));
    return c.json({ ok: true, data: { status: expired ? "expired" : device.tokenHash ? "connected" : "pending" } });
  })
  .post(
    "/poll",
    zValidator("json", z.object({ verifier: z.string().regex(/^[a-f0-9]{64}$/) })),
    async (c) => {
      c.header("cache-control", "no-store");
      // The browser only receives SHA-256(verifier). Knowing the approval URL
      // cannot redeem the device credential; the extension keeps the verifier.
      const challengeHash = hash(hash(c.req.valid("json").verifier));
      const device = await db.apifyExtensionDevice.findFirst({
        where: { pairChallengeHash: challengeHash, claimHash: null, tokenHash: null },
        include: { user: { select: {
          id: true, name: true, username: true, email: true, image: true,
          suspendedAt: true, deletionScheduledFor: true,
        } } },
      });
      if (!device) return c.json({ ok: true, data: { status: "pending" } });
      if (device.revokedAt || device.expiresAt <= new Date() || !device.claimExpiresAt ||
        device.claimExpiresAt <= new Date() || device.user.suspendedAt || device.user.deletionScheduledFor) {
        throw new AppError("extension_pair_expired", "This browser connection expired. Start sign-in again from the extension.", 409);
      }
      const token = `acx_${randomBytes(32).toString("hex")}`;
      const claimed = await db.apifyExtensionDevice.updateMany({
        where: {
          id: device.id, pairChallengeHash: challengeHash, claimHash: null, tokenHash: null,
          revokedAt: null, claimExpiresAt: { gt: new Date() }, expiresAt: { gt: new Date() },
        },
        data: { tokenHash: hash(token), pairChallengeHash: null, claimExpiresAt: null },
      });
      if (claimed.count !== 1) throw new AppError("extension_pair_used", "This connection was already completed", 409);
      return c.json({ ok: true, data: {
        status: "connected", token, userId: device.user.id, name: device.user.name,
        username: device.user.username, email: device.user.email, image: device.user.image,
        expiresAt: device.expiresAt.toISOString(),
      } });
    },
  )
  .post(
    "/claim",
    zValidator(
      "json",
      z.object({
        code: z.string().regex(/^acp_[a-f0-9]{64}$/),
        challenge: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    ),
    async (c) => {
      const { code, challenge } = c.req.valid("json");
      const device = await db.apifyExtensionDevice.findUnique({
        where: { claimHash: hash(code) },
        include: { user: { select: { id: true, name: true, username: true, email: true, image: true, suspendedAt: true, deletionScheduledFor: true } } },
      });
      if (!device || device.revokedAt || device.expiresAt <= new Date() || device.user.suspendedAt ||
        device.user.deletionScheduledFor || !device.claimExpiresAt || device.claimExpiresAt <= new Date() || device.tokenHash || !device.pairChallengeHash) {
        throw new AppError("extension_pair_expired", "The extension pairing expired", 409);
      }
      const actual = Buffer.from(hash(challenge), "hex");
      const expected = Buffer.from(device.pairChallengeHash, "hex");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new AppError("extension_pair_invalid", "The pairing challenge is invalid", 403);
      }
      const token = `acx_${randomBytes(32).toString("hex")}`;
      const claimed = await db.apifyExtensionDevice.updateMany({
        where: { id: device.id, tokenHash: null, revokedAt: null, claimHash: hash(code), claimExpiresAt: { gt: new Date() }, expiresAt: { gt: new Date() } },
        data: { tokenHash: hash(token), claimHash: null, pairChallengeHash: null, claimExpiresAt: null },
      });
      if (claimed.count !== 1) throw new AppError("extension_pair_used", "This pairing was already used", 409);
      return c.json({
        ok: true,
        data: { token, userId: device.user.id, name: device.user.name, username: device.user.username, email: device.user.email, image: device.user.image, expiresAt: device.expiresAt.toISOString() },
      });
    },
  )
  .get("/me", async (c) => c.json({ ok: true, data: identity(await authenticatedDevice(c)) }))
  .get("/workspaces", async (c) => {
    const device = await authenticatedDevice(c);
    const requestedApifyUserId = c.req.query("apifyUserId");
    const parsedId = requestedApifyUserId
      ? z.string().regex(/^[A-Za-z0-9]{8,64}$/).safeParse(requestedApifyUserId)
      : null;
    if (parsedId && !parsedId.success) {
      throw new AppError("invalid_apify_user_id", "Invalid Apify account ID", 400);
    }
    const apifyUserId = parsedId?.data ?? null;
    const profiles = await db.businessProfile.findMany({
      where: { userId: device.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        isDefault: true,
        apifyTokens: {
          take: 1,
          select: {
            apifyUserId: true,
            apifyUsername: true,
            encryptedToken: true,
            encryptedUiToken: true,
            encryptedCookies: true,
            apiTokenStatus: true,
            uiTokenStatus: true,
            cookiesStatus: true,
            validatedAt: true,
          },
        },
      },
    });
    return c.json({
      ok: true,
      data: profiles.map((profile) => {
        const credential = profile.apifyTokens[0];
        const hasCredential = Boolean(credential?.encryptedToken || credential?.encryptedUiToken || credential?.encryptedCookies);
        const connectedAccountId = hasCredential ? credential?.apifyUserId ?? null : null;
        return {
          id: profile.id,
          name: profile.name,
          isDefault: profile.isDefault,
          connection: !hasCredential
            ? "AVAILABLE"
            : apifyUserId && connectedAccountId === apifyUserId
              ? "MATCHED"
              : connectedAccountId
                ? "OTHER_ACCOUNT"
                : "UNKNOWN_ACCOUNT",
          connectedAccountId,
          apifyUsername: credential?.apifyUsername ?? null,
          apiKeyConfigured: Boolean(credential?.encryptedToken),
          apiTokenStatus: credential?.apiTokenStatus ?? "NOT_CONFIGURED",
          uiTokenConfigured: Boolean(credential?.encryptedUiToken),
          uiTokenStatus: credential?.uiTokenStatus ?? "NOT_CONFIGURED",
          browserSessionConfigured: Boolean(credential?.encryptedCookies),
          browserSessionStatus: credential?.cookiesStatus ?? "NOT_CONFIGURED",
          lastValidatedAt: credential?.validatedAt?.toISOString() ?? null,
        };
      }),
    });
  })
  .post("/workspaces/:workspaceId/apify/check", async (c) => {
    const device = await authenticatedDevice(c);
    const workspaceId = c.req.param("workspaceId");
    const workspace = await db.businessProfile.findFirst({
      where: { id: workspaceId, userId: device.userId },
      select: { id: true },
    });
    if (!workspace) throw new AppError("workspace_not_found", "This workspace is not available to the paired account", 404);
    const credential = await db.apifyToken.findUnique({
      where: { businessProfileId: workspace.id },
      select: {
        apifyUserId: true,
        encryptedToken: true,
        encryptedUiToken: true,
        encryptedCookies: true,
      },
    });
    if (!credential || (!credential.encryptedToken && !credential.encryptedUiToken && !credential.encryptedCookies)) {
      return c.json({ ok: true, data: { checkedAt: new Date().toISOString(), confirmed: false, api: "MISSING", console: "MISSING", accountAccess: "UNVERIFIED", message: "No Apify credential is saved for this workspace." } });
    }
    const client = await getUserApifyClient(device.userId, workspace.id);
    if (!client) {
      return c.json({ ok: true, data: { checkedAt: new Date().toISOString(), confirmed: false, api: credential.encryptedToken ? "ERROR" : "MISSING", console: credential.encryptedCookies || credential.encryptedUiToken ? "ERROR" : "MISSING", accountAccess: "UNVERIFIED", message: "Saved credentials could not be opened. Reconnect this workspace." } });
    }
    const [apiResult, consoleResult] = await Promise.allSettled([
      credential.encryptedToken ? withCheckTimeout(client.validateApiAuthentication()) : Promise.resolve(null),
      credential.encryptedCookies || credential.encryptedUiToken
        ? withCheckTimeout(client.validateConsoleAuthentication({ verifyOrganizations: true }))
        : Promise.resolve(null),
    ]);
    const accountResult = credential.encryptedCookies && consoleResult.status === "fulfilled"
      ? await Promise.allSettled([withCheckTimeout(validateUserApifyAccountMatch(device.userId, workspace.id))])
      : null;
    const api = !credential.encryptedToken ? "MISSING" : apiResult.status === "fulfilled" ? "VALID" : "ERROR";
    const console = !credential.encryptedCookies && !credential.encryptedUiToken
      ? "MISSING" : consoleResult.status === "fulfilled" ? "VALID" : "ERROR";
    const match = accountResult?.[0];
    const accountAccess = !credential.apifyUserId ? "UNIDENTIFIED"
      : match?.status === "fulfilled" ? match.value.matches === true ? "VALID" : match.value.matches === false ? "INVALID" : "UNVERIFIED"
        : match?.status === "rejected" ? "ERROR" : "UNVERIFIED";
    const confirmed = Boolean(credential.apifyUserId && console === "VALID" &&
      (api === "VALID" || api === "MISSING") && accountAccess === "VALID");
    const message = confirmed ? api === "MISSING"
      ? "Apify Console and organization access are verified. Add an Apify API key in ActorConsole to load Actors and use API operations."
      : "Apify accepted the saved session and confirmed access to this account."
      : accountAccess === "INVALID" ? "This browser session cannot access the saved Apify account. Reconnect it."
        : console === "MISSING" ? "No browser session is saved. Reconnect to finish the connection."
          : console === "ERROR" ? "Apify did not accept the saved browser session. Reconnect it."
            : api === "ERROR" ? "The browser session works, but the API key needs attention."
              : accountAccess === "UNIDENTIFIED" ? "The saved credential works, but its Apify account was not identified. Reconnect it."
                : "The credential works, but account access could not be confirmed. Reconnect it if needed.";
    return c.json({ ok: true, data: { checkedAt: new Date().toISOString(), confirmed, api, console, accountAccess, message } });
  })
  .post(
    "/workspaces/:workspaceId/apify/api-key",
    zValidator("json", z.object({
      token: z.string().trim().min(20).max(2048).regex(/^[^\s;,]+$/),
      expectedApifyAccountId: z.string().regex(/^[A-Za-z0-9]{8,64}$/),
    })),
    async (c) => {
      const device = await authenticatedDevice(c);
      await assertFeatureEnabled("apify_chrome_extension", device.userId);
      const workspaceId = c.req.param("workspaceId");
      const { token, expectedApifyAccountId } = c.req.valid("json");
      const workspace = await db.businessProfile.findFirst({
        where: { id: workspaceId, userId: device.userId },
        select: { id: true },
      });
      if (!workspace) {
        throw new AppError("workspace_not_found", "This workspace is not available to the paired account", 404);
      }
      const connection = await db.apifyToken.findUnique({
        where: { businessProfileId: workspace.id },
        select: { apifyUserId: true, encryptedCookies: true },
      });
      if (!connection?.encryptedCookies || connection.apifyUserId !== expectedApifyAccountId) {
        throw new AppError(
          "apify_account_mismatch",
          "Connect this Apify account's browser session to the workspace before importing its API key.",
          409,
        );
      }
      try {
        const saved = await saveApifyToken(
          device.userId,
          token,
          workspace.id,
          undefined,
          undefined,
          undefined,
          expectedApifyAccountId,
        );
        return c.json({
          ok: true,
          data: {
            apifyAccountId: saved.apifyUserId,
            apiKeyConfigured: saved.apiKeyConfigured,
            browserSessionConfigured: saved.cookiesConfigured,
          },
        });
      } catch (error) {
        if (error instanceof ApifyClientError) {
          throw new AppError(
            "apify_api_key_rejected",
            error.status === 409
              ? "This API key belongs to a different Apify account than the saved browser session."
              : "Apify did not accept this account's API key. Review it in API & Integrations.",
            error.status === 409 ? 409 : 422,
          );
        }
        throw error;
      }
    },
  )
  .delete("/workspaces/:workspaceId/apify", async (c) => {
    const device = await authenticatedDevice(c);
    const workspaceId = c.req.param("workspaceId");
    const workspace = await db.businessProfile.findFirst({
      where: { id: workspaceId, userId: device.userId },
      select: { id: true },
    });
    if (!workspace) {
      throw new AppError("workspace_not_found", "This workspace is not available to the paired account", 404);
    }
    await db.$transaction([
      db.apifyToken.deleteMany({ where: { userId: device.userId, businessProfileId: workspace.id } }),
      db.onboardingState.updateMany({
        where: { userId: device.userId, businessProfileId: workspace.id },
        data: { apifyConnected: false },
      }),
    ]);
    return c.json({ ok: true, data: { disconnected: true } });
  })
  .post(
    "/workspaces",
    zValidator("json", z.object({
      apifyUserId: z.string().regex(/^[A-Za-z0-9]{8,64}$/).optional(),
      name: z.string().trim().min(1).max(100),
    })),
    async (c) => {
      const device = await authenticatedDevice(c);
      await assertFeatureEnabled("apify_chrome_extension", device.userId);
      const { apifyUserId, name } = c.req.valid("json");
      if (apifyUserId) {
        const match = await db.apifyToken.findFirst({
          where: { userId: device.userId, apifyUserId },
          select: { businessProfileId: true },
        });
        if (match) {
          throw new AppError("apify_workspace_exists", "This Apify account is already connected to a workspace", 409);
        }
      }
      const baseSlug = slugify(name);
      let slug = baseSlug;
      let suffix = 2;
      while (await db.businessProfile.findUnique({ where: { userId_slug: { userId: device.userId, slug } } })) {
        slug = `${baseSlug}-${suffix++}`;
      }
      const count = await db.businessProfile.count({ where: { userId: device.userId } });
      const profile = await db.businessProfile.create({
        data: {
          userId: device.userId,
          name,
          slug,
          isDefault: count === 0,
          onboardingStates: { create: { userId: device.userId, profileComplete: true } },
        },
        select: { id: true, name: true },
      });
      return c.json({ ok: true, data: profile }, 201);
    },
  )
  .post(
    "/authorize-handoff",
    zValidator(
      "json",
      z.object({
        handoffId: z.string().min(1).max(191),
        challenge: z.string().min(32).max(256),
        apifyAccountId: z.string().regex(/^[A-Za-z0-9]{8,64}$/).optional(),
        apifyAccountType: z.enum(["PERSONAL", "ORGANIZATION"]).optional(),
      }).refine(
        (value) => Boolean(value.apifyAccountId) === Boolean(value.apifyAccountType),
        "Choose both an Apify account and its type",
      ),
    ),
    async (c) => {
      const device = await authenticatedDevice(c);
      const { handoffId, challenge, apifyAccountId, apifyAccountType } = c.req.valid("json");
      const handoff = await db.apifyExtensionSession.findUnique({ where: { id: handoffId } });
      if (
        !handoff ||
        handoff.userId !== device.userId ||
        handoff.consumedAt ||
        handoff.expiresAt <= new Date() ||
        (handoff.deviceId && handoff.deviceId !== device.id)
      ) {
        throw new AppError("extension_handoff_invalid", "This handoff is not for the paired ActorConsole account", 403);
      }
      const actual = Buffer.from(hash(challenge), "hex");
      const expected = Buffer.from(handoff.challengeHash, "hex");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new AppError("extension_handoff_invalid", "The handoff challenge is invalid", 403);
      }
      if (handoff.apifyAccountId && (
        handoff.apifyAccountId !== apifyAccountId ||
        handoff.apifyAccountType !== apifyAccountType
      )) {
        throw new AppError("extension_handoff_account_mismatch", "The selected Apify account changed", 409);
      }
      const claimed = await db.apifyExtensionSession.updateMany({
        where: {
          id: handoffId,
          userId: device.userId,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          apifyAccountId: handoff.apifyAccountId,
          OR: [{ deviceId: null }, { deviceId: device.id }],
        },
        data: {
          deviceId: device.id,
          ...(apifyAccountId ? { apifyAccountId, apifyAccountType } : {}),
        },
      });
      if (claimed.count !== 1) {
        throw new AppError("extension_handoff_invalid", "This handoff is no longer available", 409);
      }
      return c.json({ ok: true, data: { userId: device.userId } });
    },
  )
  .delete("/me", async (c) => {
    const device = await authenticatedDevice(c);
    await db.apifyExtensionDevice.update({
      where: { id: device.id },
      data: { revokedAt: new Date() },
    });
    return c.json({ ok: true });
  });
