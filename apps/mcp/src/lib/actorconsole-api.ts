import { getActorConsoleApiKey, getMcpRequestContext } from "./request-context.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export class ActorConsoleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ActorConsoleApiError";
  }
}

function getApiBaseUrl(): string {
  const configured = process.env.API_BASE_URL;
  const value = configured ?? "http://localhost:4000";
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use HTTPS in production");
  }
  return url.toString().replace(/\/+$/, "");
}

export interface ActorConsoleApiEnvelope<T, M = unknown> {
  data: T;
  meta?: M;
}

export async function actorConsoleApiEnvelope<T, M = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ActorConsoleApiEnvelope<T, M>> {
  const apiKey = getActorConsoleApiKey();

  const baseUrl = getApiBaseUrl();
  if (path !== "/mcp/info") {
    await verifyActorConsoleMcpAccess();
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "x-actorconsole-client": "mcp",
      ...(getMcpRequestContext()?.toolName
        ? { "x-actorconsole-mcp-tool": getMcpRequestContext()!.toolName! }
        : {}),
      ...(getMcpRequestContext()?.requestId
        ? { "x-request-id": getMcpRequestContext()!.requestId }
        : {}),
      ...(getMcpRequestContext()?.actorIds?.length
        ? {
            "x-actorconsole-mcp-actor-ids": getMcpRequestContext()!
              .actorIds!.join(",")
              .slice(0, 4_000),
          }
        : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  const body = (await response.json().catch(() => null)) as {
    data?: T;
    meta?: M;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new ActorConsoleApiError(
      body?.error?.message ?? `ActorConsole API returned ${response.status}`,
      response.status,
    );
  }
  if (!body || !("data" in body)) {
    throw new Error("ActorConsole API returned an invalid response");
  }
  return { data: body.data as T, ...(body.meta === undefined ? {} : { meta: body.meta }) };
}

export async function actorConsoleApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await actorConsoleApiEnvelope<T>(path, init)).data;
}

export async function verifyActorConsoleMcpAccess(): Promise<void> {
  const context = getMcpRequestContext();
  if (context?.mcpAccessVerified) return;

  const baseUrl = getApiBaseUrl();
  const apiKey = getActorConsoleApiKey();
  const response = await fetch(`${baseUrl}/mcp/info`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "x-actorconsole-client": "mcp",
      ...(getMcpRequestContext()?.toolName
        ? { "x-actorconsole-mcp-tool": getMcpRequestContext()!.toolName! }
        : {}),
      ...(context?.requestId ? { "x-request-id": context.requestId } : {}),
      ...(context?.actorIds?.length
        ? { "x-actorconsole-mcp-actor-ids": context.actorIds.join(",").slice(0, 4_000) }
        : {}),
    },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ActorConsoleApiError(
      body?.error?.message ?? `MCP access check failed (${response.status})`,
      response.status,
    );
  }
  if (context) context.mcpAccessVerified = true;
}
