import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actorConsoleApi } from "../lib/actorconsole-api.js";
import { jsonResult, errorResult } from "../lib/respond.js";

interface TrackedActor {
  apifyActorId: string;
  username: string;
  actorName: string;
  title: string | null;
  description: string | null;
  currentImageUrl: string | null;
  currentPricing: unknown;
  storeIsPublic: boolean | null;
  storeIsDeprecated: boolean | null;
  storeNotice: string | null;
  publishReady: boolean | null;
  updatedAt: string;
}

const actorStatus = z.enum([
  "all",
  "published",
  "maintenance",
  "deprecated",
  "unpublished",
  "publish-ready",
]);

interface ActorPage {
  items: TrackedActor[];
  total: number;
  page: number;
  limit: number;
  cached: boolean;
  synchronizedAt: string | null;
}

async function listActors(
  status: z.infer<typeof actorStatus>,
  input: { limit: number; page?: number; q?: string; readiness?: string },
) {
  const query = new URLSearchParams({
    status,
    limit: String(input.limit),
    page: String(input.page ?? 1),
    format: "page",
  });
  if (input.q) query.set("q", input.q);
  if (input.readiness) query.set("readiness", input.readiness);
  return actorConsoleApi<ActorPage>(`/actors?${query.toString()}`);
}

function registerStatusTool(
  server: McpServer,
  name:
    | "list_published_actors"
    | "list_maintenance_actors"
    | "list_deprecated_actors"
    | "list_unpublished_actors"
    | "list_publish_ready_actors",
  status: Exclude<z.infer<typeof actorStatus>, "all">,
  description: string,
) {
  server.tool(
    name,
    description,
    { limit: z.number().int().min(1).max(500).optional().default(100) },
    async ({ limit }) => {
      try {
        return jsonResult(await listActors(status, { limit }));
      } catch (error) {
        return errorResult(`Failed to ${name.replaceAll("_", " ")}`, String(error));
      }
    },
  );
}

export function registerActorTools(server: McpServer) {
  server.tool(
    "list_actors",
    "List the actors tracked in your ActorConsole workspace.",
    {
      status: actorStatus.optional().default("all"),
      page: z.number().int().min(1).optional().default(1),
      limit: z.number().int().min(1).max(500).optional().default(100),
      search: z.string().trim().max(120).optional(),
      readiness: z
        .enum([
          "all",
          "ready",
          "needs-attention",
          "unknown",
          "missing-description",
          "missing-readme",
          "missing-input-schema",
          "missing-output-schema",
          "missing-key-value-store-schema",
          "missing-tagged-build",
          "missing-public-profile",
          "email-not-verified",
          "disposable-email",
        ])
        .optional()
        .default("all"),
    },
    async ({ status, page, limit, search, readiness }) => {
      try {
        return jsonResult(await listActors(status, { page, limit, q: search, readiness }));
      } catch (err) {
        return errorResult("Failed to list actors", String(err));
      }
    },
  );

  registerStatusTool(
    server,
    "list_published_actors",
    "published",
    "List public, non-deprecated Actors that are not under maintenance.",
  );
  registerStatusTool(
    server,
    "list_maintenance_actors",
    "maintenance",
    "List Actors currently marked as under maintenance.",
  );
  registerStatusTool(
    server,
    "list_deprecated_actors",
    "deprecated",
    "List deprecated Actors in this workspace.",
  );
  registerStatusTool(
    server,
    "list_unpublished_actors",
    "unpublished",
    "List private or otherwise unpublished Actors in this workspace.",
  );
  registerStatusTool(
    server,
    "list_publish_ready_actors",
    "publish-ready",
    "List Actors whose synchronized listing passes publish-readiness checks.",
  );

  server.tool(
    "get_actor",
    "Get synchronized Actor metadata, recent copy and pricing history, and website classification.",
    {
      apifyActorId: z.string().min(1).describe("The actor ID (for example, username~actor-name)"),
    },
    async ({ apifyActorId }) => {
      try {
        return jsonResult(
          await actorConsoleApi<unknown>(`/actors/${encodeURIComponent(apifyActorId)}`),
        );
      } catch (err) {
        return errorResult("Failed to get actor", String(err));
      }
    },
  );

  server.tool(
    "sync_actors",
    "Synchronize this workspace's Actor inventory from the connected Apify account.",
    {},
    async () => {
      try {
        return jsonResult(await actorConsoleApi("/actors/sync", { method: "POST" }));
      } catch (error) {
        return errorResult("Failed to sync actors", String(error));
      }
    },
  );
}
