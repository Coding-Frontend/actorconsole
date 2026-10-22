export type Plan = "FREE" | "PRO";
export const MCP_CAPABILITIES = [
  "workspace:read",
  "actors:read",
  "actors:sync",
  "actors:optimize",
  "actors:write",
  "notifications:read",
  "notifications:write",
  "usage:read",
  "pricing:read",
  "pricing:write",
  "publishing:read",
  "publishing:write",
  "publishing:run",
] as const;
export type McpCapability = (typeof MCP_CAPABILITIES)[number];

/**
 * `read`, `write`, and `mcp` are retained for backward compatibility with
 * existing credentials. New MCP credentials also carry explicit capabilities.
 */
export const API_KEY_SCOPES = ["read", "write", "mcp", ...MCP_CAPABILITIES] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === "string" && (API_KEY_SCOPES as readonly string[]).includes(value);
}

export interface PublicUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  plan: Plan;
  createdAt: string;
}

export interface UserSession {
  userId: string;
  email: string;
  plan: Plan;
  businessProfileId?: string;
  authMethod?: "session" | "api-key" | "impersonation";
  apiKeyId?: string;
  apiKeyScopes?: ApiKeyScope[];
  apiKeyActorIds?: string[];
  impersonatedById?: string;
  impersonationExpiresAt?: string;
}
