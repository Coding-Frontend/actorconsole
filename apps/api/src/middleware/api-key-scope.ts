import type { Context, Next } from "hono";
import type { ApiKeyScope, McpCapability } from "@actorconsole/shared";
import type { AppEnv } from "../app.js";
import { AppError } from "./error.js";

/** Enforce the least privilege selected when a personal API key was created. */
export function requireApiKeyScope(scope: ApiKeyScope) {
  return async (c: Context<AppEnv>, next: Next) => {
    const session = c.get("session");
    if (session?.authMethod !== "api-key") return next();
    // Empty scopes are treated as legacy full-access keys so existing keys do
    // not unexpectedly break during the migration.
    const scopes = session.apiKeyScopes ?? [];
    if (scopes.length > 0 && !scopes.includes(scope)) {
      throw new AppError(
        "api_key_scope_denied",
        `This API key does not include the ${scope} scope`,
        403,
      );
    }
    return next();
  };
}

/** GET/HEAD calls need read; mutations need write. */
export function requireApiKeyMethodScope(options: { allowGranularMcp?: boolean } = {}) {
  return async (c: Context<AppEnv>, next: Next) => {
    const session = c.get("session");
    if (
      options.allowGranularMcp === true &&
      session?.authMethod === "api-key" &&
      (session.apiKeyScopes ?? []).some((scope) => scope.includes(":"))
    ) {
      // Granular MCP credentials are authorized by the route-specific
      // capability middleware that follows this legacy compatibility check.
      return next();
    }
    const method = c.req.method.toUpperCase();
    const scope: ApiKeyScope = method === "GET" || method === "HEAD" ? "read" : "write";
    return requireApiKeyScope(scope)(c, next);
  };
}

/**
 * Enforce a granular MCP permission. Credentials issued before granular
 * permissions existed contain only read/write/mcp and remain compatible.
 */
export function requireApiKeyCapability(capability: McpCapability) {
  return async (c: Context<AppEnv>, next: Next) => {
    assertApiKeyCapability(c.get("session"), capability);
    return next();
  };
}

export function requireApiKeyMethodCapability(
  readCapability: McpCapability,
  writeCapability: McpCapability,
) {
  return async (c: Context<AppEnv>, next: Next) => {
    const method = c.req.method.toUpperCase();
    assertApiKeyCapability(
      c.get("session"),
      method === "GET" || method === "HEAD" ? readCapability : writeCapability,
    );
    return next();
  };
}

export function assertApiKeyCapability(
  session: AppEnv["Variables"]["session"],
  capability: McpCapability,
): void {
  if (session.authMethod !== "api-key") return;
  const scopes = session.apiKeyScopes ?? [];
  const hasGranularPermissions = scopes.some((scope) => scope.includes(":"));
  if (hasGranularPermissions && !scopes.includes(capability)) {
    throw new AppError(
      "api_key_capability_denied",
      `This MCP credential does not include the ${capability} permission`,
      403,
    );
  }
}

export function requireActorApiKeyCapability() {
  return async (c: Context<AppEnv>, next: Next) => {
    const method = c.req.method.toUpperCase();
    const path = c.req.path;
    let capability: McpCapability;
    if (path === "/actors/sync") capability = "actors:sync";
    else if (
      path.includes("/usage") ||
      path.startsWith("/actors/costs") ||
      path.startsWith("/actors/revenue")
    )
      capability = "usage:read";
    else if (path.includes("/pricing")) {
      capability = method === "GET" || method === "HEAD" ? "pricing:read" : "pricing:write";
    } else if (
      path.includes("/optimization") ||
      path.includes("/rewrite-") ||
      path.endsWith("/optimize")
    ) {
      capability = path.endsWith("/approve") ? "actors:write" : "actors:optimize";
    } else {
      capability = method === "GET" || method === "HEAD" ? "actors:read" : "actors:write";
    }
    assertApiKeyCapability(c.get("session"), capability);
    return next();
  };
}

export function requirePublishingApiKeyCapability() {
  return async (c: Context<AppEnv>, next: Next) => {
    const method = c.req.method.toUpperCase();
    const path = c.req.path;
    const capability: McpCapability =
      method === "GET" || method === "HEAD"
        ? "publishing:read"
        : path.endsWith("/run")
          ? "publishing:run"
          : "publishing:write";
    assertApiKeyCapability(c.get("session"), capability);
    return next();
  };
}

export function assertApiKeyActorScope(
  session: AppEnv["Variables"]["session"],
  actorId: string,
): void {
  if (session.authMethod !== "api-key") return;
  const actorIds = session.apiKeyActorIds ?? [];
  if (actorIds.length > 0 && !actorIds.includes(actorId)) {
    throw new AppError("api_key_actor_denied", "This API key is not scoped to this actor", 403);
  }
}

export function assertApiKeyUnscoped(session: AppEnv["Variables"]["session"]): void {
  if (session.authMethod === "api-key" && (session.apiKeyActorIds?.length ?? 0) > 0) {
    throw new AppError(
      "api_key_actor_scope_required",
      "This operation requires an API key without an actor restriction",
      403,
    );
  }
}
