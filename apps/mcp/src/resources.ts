import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { actorConsoleApi } from "./lib/actorconsole-api.js";

function jsonResource(uri: string, data: unknown) {
  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
  };
}

export function registerResources(server: McpServer) {
  server.registerResource(
    "workspace",
    "actorconsole://workspace",
    {
      title: "ActorConsole workspace",
      description: "Workspace bound to this MCP credential",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri.toString(), await actorConsoleApi("/mcp/workspace")),
  );

  server.registerResource(
    "actors",
    "actorconsole://actors",
    {
      title: "Tracked Actors",
      description: "Actors visible to this credential",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri.toString(), await actorConsoleApi("/actors?limit=500")),
  );

  const actorList = async () => {
    const actors =
      await actorConsoleApi<Array<{ apifyActorId: string; title?: string | null }>>(
        "/actors?limit=500",
      );
    return {
      resources: actors.map((actor) => ({
        uri: `actorconsole://actors/${encodeURIComponent(actor.apifyActorId)}`,
        name: actor.title || actor.apifyActorId,
        mimeType: "application/json",
      })),
    };
  };

  server.registerResource(
    "actor-detail",
    new ResourceTemplate("actorconsole://actors/{actorId}", { list: () => actorList() }),
    {
      title: "Actor detail",
      description: "Cached Actor metadata and current operational context",
      mimeType: "application/json",
    },
    async (uri, { actorId }) =>
      jsonResource(
        uri.toString(),
        await actorConsoleApi(`/actors/${encodeURIComponent(decodeURIComponent(String(actorId)))}`),
      ),
  );

  server.registerResource(
    "notifications",
    "actorconsole://notifications",
    {
      title: "Notifications",
      description: "Latest workspace notifications",
      mimeType: "application/json",
    },
    async (uri) =>
      jsonResource(uri.toString(), await actorConsoleApi("/notifications?page=1&limit=100")),
  );

  server.registerResource(
    "publishing",
    "actorconsole://publishing/schedules",
    {
      title: "Publishing schedules",
      description: "Publishing queues and recent execution state",
      mimeType: "application/json",
    },
    async (uri) =>
      jsonResource(uri.toString(), await actorConsoleApi("/bulk-publishing/schedules")),
  );
}
