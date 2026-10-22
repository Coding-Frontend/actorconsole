import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerActorTools } from "./tools/actors.js";
import { registerOptimizeTools } from "./tools/optimize.js";
import { registerPricingTools } from "./tools/pricing.js";
import { registerKeywordTools } from "./tools/keywords.js";
import { registerUsageTools } from "./tools/usage.js";
import { registerWorkspaceTools } from "./tools/workspace.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerPublishingTools } from "./tools/publishing.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { version } from "../package.json";

/**
 * Build the ActorConsole MCP server. Each tool group is registered separately
 * so they can be evolved independently and tested in isolation.
 */
export async function createServer(): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "actorconsole",
      version,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions:
        "ActorConsole MCP manages the single workspace bound to this credential. " +
        "Inspect permissions with get_mcp_capabilities, discover Actors with list_actors, " +
        "create optimization proposals before applying changes, and create publishing " +
        "schedules paused unless the user explicitly requests activation. Never apply " +
        "or publish generated content without explicit approval.",
    },
  );

  registerActorTools(server);
  registerWorkspaceTools(server);
  registerNotificationTools(server);
  registerPublishingTools(server);
  registerOptimizeTools(server);
  registerPricingTools(server);
  registerKeywordTools(server);
  registerUsageTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
