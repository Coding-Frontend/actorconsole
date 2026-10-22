import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface McpRequestContext {
  actorConsoleApiKey: string;
  requestId: string;
  transport: "http" | "stdio";
  toolName?: string;
  actorIds?: string[];
  mcpAccessVerified: boolean;
}

const requestContext = new AsyncLocalStorage<McpRequestContext>();

export function runWithMcpRequestContext<T>(
  context: Omit<McpRequestContext, "mcpAccessVerified">,
  callback: () => T,
): T {
  return requestContext.run({ ...context, mcpAccessVerified: false }, callback);
}

export function getMcpRequestContext(): McpRequestContext | undefined {
  return requestContext.getStore();
}

export function getActorConsoleApiKey(): string {
  const key = requestContext.getStore()?.actorConsoleApiKey ?? process.env.ACTORCONSOLE_API_KEY;
  if (!key) {
    throw new Error(
      "ActorConsole authentication is missing. Send a workspace MCP credential or configure ACTORCONSOLE_API_KEY for stdio.",
    );
  }
  return key;
}

/** Only explicit Actor identifiers are propagated into audit metadata. */
export function getRequestMetadata(message: unknown): { toolName?: string; actorIds: string[] } {
  const request =
    message && typeof message === "object"
      ? (message as { method?: unknown; params?: { name?: unknown; arguments?: unknown } })
      : null;
  const toolName =
    request?.method === "tools/call" && typeof request.params?.name === "string"
      ? request.params.name.slice(0, 120)
      : undefined;
  const input = request?.params?.arguments;
  const args =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const actorIds = [
    ...(typeof args.apifyActorId === "string" ? [args.apifyActorId] : []),
    ...(typeof args.actorId === "string" ? [args.actorId] : []),
    ...(Array.isArray(args.actorIds)
      ? args.actorIds.filter((value): value is string => typeof value === "string")
      : []),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 100);
  return { toolName, actorIds };
}

export function createStdioRequestContext(message?: unknown): McpRequestContext {
  return {
    actorConsoleApiKey: getActorConsoleApiKey(),
    requestId: randomUUID(),
    transport: "stdio",
    ...getRequestMetadata(message),
    mcpAccessVerified: false,
  };
}
