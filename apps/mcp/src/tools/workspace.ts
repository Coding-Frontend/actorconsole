import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actorConsoleApi } from "../lib/actorconsole-api.js";
import { errorResult, jsonResult } from "../lib/respond.js";

interface McpInfo {
  name: string;
  version: string;
  transport: string;
  permissions: string[];
  actorScope: string[] | "all";
  tools: string[];
  resources: string[];
  prompts: string[];
}

interface WorkspaceResponse {
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: "FREE" | "PRO";
    createdAt: string;
    updatedAt: string;
    apifyConnection: {
      connected: boolean;
      apifyUserId: string | null;
      username: string | null;
      apiTokenStatus: string;
      uiTokenStatus: string;
      cookiesStatus: string;
      validatedAt: string | null;
    };
  } | null;
  permissions: string[];
  actorScope: string[] | "all";
}

export function registerWorkspaceTools(server: McpServer) {
  server.tool(
    "get_workspace",
    "Return the single ActorConsole workspace permanently bound to this MCP credential.",
    {},
    async () => {
      try {
        const result = await actorConsoleApi<WorkspaceResponse>("/mcp/workspace");
        return jsonResult(result);
      } catch (error) {
        return errorResult("Failed to get workspace", String(error));
      }
    },
  );

  server.tool(
    "get_mcp_capabilities",
    "List the permissions, actor restriction, and tools available to this MCP credential.",
    {},
    async () => {
      try {
        const info = await actorConsoleApi<McpInfo>("/mcp/info");
        return jsonResult({
          server: { name: info.name, version: info.version, transport: info.transport },
          permissions: info.permissions,
          actorScope: info.actorScope,
          tools: info.tools,
          resources: info.resources,
          prompts: info.prompts,
        });
      } catch (error) {
        return errorResult("Failed to get MCP capabilities", String(error));
      }
    },
  );

  server.tool(
    "get_mcp_usage",
    "Return per-tool call counts, failures, latency, and last-use timestamps for this MCP credential.",
    { days: z.number().int().min(1).max(90).optional().default(30) },
    async ({ days }) => {
      try {
        return jsonResult(await actorConsoleApi(`/mcp/usage?days=${days}`));
      } catch (error) {
        return errorResult("Failed to get MCP usage", String(error));
      }
    },
  );
}
