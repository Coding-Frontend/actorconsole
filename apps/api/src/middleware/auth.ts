import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { db } from "@actorconsole/db";
import { createHash } from "node:crypto";
import { checkRateLimit } from "../lib/rate-limit.js";
import { getLogger, isApiKeyScope, type ApiKeyScope, type UserSession } from "@actorconsole/shared";

const log = getLogger("api:auth");

declare module "hono" {
  interface ContextVariableMap {
    session: UserSession;
  }
}

/**
 * Validates an Auth.js session cookie sent from the web app.
 * For service-to-service calls (MCP and provider webhooks), use a different
 * auth path (X-API-Key header or webhook signature).
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const priorSession = c.get("session") as UserSession | undefined;
    // Several route modules layer their own auth middleware under the app-wide
    // boundary. Once a trusted middleware has populated the context, do not
    // repeat the database lookup or double-count API-key usage.
    if (priorSession?.userId) {
      await next();
      return;
    }
    const cookieToken =
      getCookie(c, "authjs.session-token") ?? getCookie(c, "__Secure-authjs.session-token");
    const bearerToken = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const sessionToken = cookieToken ?? bearerToken;

    if (!sessionToken) {
      return c.json(
        { ok: false, error: { code: "unauthenticated", message: "Missing session" } },
        401,
      );
    }

    if (!cookieToken && bearerToken?.startsWith("al_")) {
      if (!/^al_[a-f0-9]{64}$/.test(bearerToken)) {
        return c.json(
          { ok: false, error: { code: "unauthenticated", message: "Invalid API key" } },
          401,
        );
      }
      const keyHash = createHash("sha256").update(bearerToken).digest("hex");
      const apiKey = await db.apiKey.findUnique({
        where: { keyHash },
        include: {
          businessProfile: {
            select: { id: true, userId: true, plan: true },
          },
          user: {
            select: {
              id: true,
              email: true,
              plan: true,
              suspendedAt: true,
              deletionScheduledFor: true,
            },
          },
        },
      });
      if (
        !apiKey ||
        apiKey.revokedAt ||
        (apiKey.expiresAt && apiKey.expiresAt <= new Date()) ||
        apiKey.businessProfile.userId !== apiKey.userId
      ) {
        return c.json(
          { ok: false, error: { code: "unauthenticated", message: "Invalid or expired API key" } },
          401,
        );
      }
      if (apiKey.user.suspendedAt) {
        return c.json(
          { ok: false, error: { code: "account_suspended", message: "Account is suspended" } },
          403,
        );
      }
      if (!apiKey.lastUsedAt || Date.now() - apiKey.lastUsedAt.getTime() > 300_000) {
        await db.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
      }
      c.set("session", {
        userId: apiKey.user.id,
        email: apiKey.user.email,
        plan: apiKey.businessProfile.plan,
        businessProfileId: apiKey.businessProfile.id,
        authMethod: "api-key",
        apiKeyId: apiKey.id,
        apiKeyScopes: parseApiKeyJson<ApiKeyScope>(apiKey.scopes).filter(isApiKeyScope),
        apiKeyActorIds: parseApiKeyJson<string>(apiKey.actorIds),
      });
      const isMcpRequest =
        c.req.header("x-actorconsole-client") === "mcp" ||
        c.req.path === "/mcp" ||
        c.req.path.startsWith("/mcp/");
      if (isMcpRequest) {
        const toolName = c.req.header("x-actorconsole-mcp-tool")?.slice(0, 120) || "discovery";
        const isMutation = !["GET", "HEAD"].includes(c.req.method.toUpperCase());
        const toolMutationLimit = toolName === "run_publishing_schedule" ? 5 : isMutation ? 20 : 60;
        const limits = await Promise.all([
          checkRateLimit(`mcp:key:${apiKey.id}`, { windowMs: 60_000, max: 120 }),
          checkRateLimit(`mcp:workspace:${apiKey.businessProfile.id}`, {
            windowMs: 60_000,
            max: 300,
          }),
          checkRateLimit(`mcp:key-tool:${apiKey.id}:${toolName}`, {
            windowMs: 60_000,
            max: toolMutationLimit,
          }),
        ]);
        const denied = limits.find((limit) => !limit.allowed);
        if (denied) {
          c.header("retry-after", String(Math.max(1, Math.ceil(denied.retryAfterMs / 1_000))));
          return c.json(
            {
              ok: false,
              error: { code: "rate_limited", message: "MCP request rate limit exceeded" },
            },
            429,
          );
        }
      }
      void recordApiKeyUsage(apiKey.user.id, isMcpRequest ? "mcp_calls" : "api_requests");
      const startedAt = performance.now();
      let failed = false;
      try {
        await next();
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        if (isMcpRequest) {
          await recordMcpAudit({
            userId: apiKey.user.id,
            workspaceId: apiKey.businessProfile.id,
            apiKeyId: apiKey.id,
            toolName: c.req.header("x-actorconsole-mcp-tool")?.slice(0, 120) || "discovery",
            method: c.req.method,
            path: c.req.path,
            requestId: c.req.header("x-request-id") ?? null,
            durationMs: Math.round(performance.now() - startedAt),
            status: failed ? "error" : c.res.status >= 400 ? "error" : "success",
            responseStatus: failed ? 500 : c.res.status,
            actorScope: parseApiKeyJson<string>(apiKey.actorIds),
            permissions: parseApiKeyJson<string>(apiKey.scopes).filter((scope) =>
              scope.includes(":"),
            ),
            permissionUsed: inferMcpPermission(c.req.path, c.req.method),
            actorIds: (c.req.header("x-actorconsole-mcp-actor-ids") ?? "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
              .slice(0, 100),
            idempotencyKey: c.req.header("idempotency-key")?.slice(0, 191) ?? null,
          });
        }
      }
      return;
    }

    const session = await db.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            plan: true,
            suspendedAt: true,
            deletionScheduledFor: true,
          },
        },
      },
    });

    if (!session || session.expires < new Date()) {
      return c.json(
        { ok: false, error: { code: "unauthenticated", message: "Session expired" } },
        401,
      );
    }

    if (session.user.suspendedAt && !session.user.deletionScheduledFor) {
      return c.json(
        { ok: false, error: { code: "account_suspended", message: "Account is suspended" } },
        403,
      );
    }

    if (
      session.user.deletionScheduledFor &&
      !c.req.path.endsWith("/account/deletion") &&
      !c.req.path.endsWith("/account/deletion/cancel") &&
      !c.req.path.endsWith("/account/export")
    ) {
      return c.json(
        {
          ok: false,
          error: { code: "account_deletion_pending", message: "Account deletion is pending" },
        },
        423,
      );
    }

    if (session.impersonationExpiresAt && session.impersonationExpiresAt <= new Date()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return c.json(
        {
          ok: false,
          error: { code: "impersonation_expired", message: "Impersonation session expired" },
        },
        401,
      );
    }

    c.set("session", {
      userId: session.user.id,
      email: session.user.email,
      plan: priorSession?.businessProfileId ? priorSession.plan : session.user.plan,
      businessProfileId: priorSession?.businessProfileId,
      authMethod: session.impersonatedById ? "impersonation" : "session",
      impersonatedById: session.impersonatedById ?? undefined,
      impersonationExpiresAt: session.impersonationExpiresAt?.toISOString(),
    });

    await next();
  };
}

async function recordMcpAudit(input: {
  userId: string;
  workspaceId: string;
  apiKeyId: string;
  toolName: string;
  method: string;
  path: string;
  requestId: string | null;
  durationMs: number;
  status: "success" | "error";
  responseStatus: number;
  actorScope: string[];
  permissions: string[];
  permissionUsed: string | null;
  actorIds: string[];
  idempotencyKey: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.userId,
        action: `mcp.${input.toolName}`,
        resource: `workspace:${input.workspaceId}`,
        source: "mcp",
        after: {
          apiKeyId: input.apiKeyId,
          workspaceId: input.workspaceId,
          tool: input.toolName,
          method: input.method,
          path: input.path,
          requestId: input.requestId,
          durationMs: input.durationMs,
          status: input.status,
          responseStatus: input.responseStatus,
          actorScope: input.actorScope.length ? input.actorScope : "all",
          permissions: input.permissions,
          permissionUsed: input.permissionUsed,
          actorIds: input.actorIds,
          mutation: !["GET", "HEAD"].includes(input.method.toUpperCase()),
          mutationTarget: input.path,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
  } catch (error) {
    log.warn({ error, toolName: input.toolName }, "Could not record MCP audit event");
  }
}

function inferMcpPermission(path: string, method: string): string | null {
  const read = ["GET", "HEAD"].includes(method.toUpperCase());
  if (path === "/mcp/workspace" || path === "/mcp/usage") return "workspace:read";
  if (path.startsWith("/notifications")) return read ? "notifications:read" : "notifications:write";
  if (path.startsWith("/bulk-publishing")) {
    return read ? "publishing:read" : path.endsWith("/run") ? "publishing:run" : "publishing:write";
  }
  if (path.startsWith("/keywords")) return "actors:read";
  if (path.startsWith("/actors")) {
    if (path === "/actors/sync") return "actors:sync";
    if (
      path.includes("/usage") ||
      path.startsWith("/actors/costs") ||
      path.startsWith("/actors/revenue")
    )
      return "usage:read";
    if (path.includes("/pricing")) return read ? "pricing:read" : "pricing:write";
    if (
      path.includes("/optimization") ||
      path.includes("/rewrite-") ||
      path.endsWith("/optimize")
    ) {
      return path.endsWith("/approve") ? "actors:write" : "actors:optimize";
    }
    return read ? "actors:read" : "actors:write";
  }
  return null;
}

async function recordApiKeyUsage(userId: string, metric: "api_requests" | "mcp_calls") {
  const now = new Date();
  try {
    await db.usageRecord.upsert({
      where: {
        userId_metric_month_year: {
          userId,
          metric,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      },
      create: {
        userId,
        metric,
        quantity: 1,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
      update: { quantity: { increment: 1 } },
    });
  } catch (error) {
    // Usage accounting is observability, not an authentication dependency.
    // A write outage must never make a valid API key unusable.
    log.warn({ error, userId, metric }, "Could not record API-key usage");
  }
}

/**
 * Require a browser-backed Auth.js session for security-, credential-, and
 * billing-sensitive endpoints. Personal API keys deliberately authenticate
 * workspace automation, but must never become a substitute for an
 * interactive account session.
 */
export function requireInteractiveSession() {
  return async (c: Context, next: Next) => {
    const session = c.get("session");
    if (session?.authMethod === "api-key") {
      return c.json(
        {
          ok: false,
          error: {
            code: "interactive_session_required",
            message: "This operation requires an interactive sign-in session",
          },
        },
        403,
      );
    }
    await next();
  };
}

function parseApiKeyJson<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter((item): item is T => item !== null) : [];
}
