import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actorConsoleApi } from "../lib/actorconsole-api.js";
import { errorResult, jsonResult } from "../lib/respond.js";

const optimizationField = z.enum(["title", "description", "pricing"]);

const optimizationKind = z.enum([
  "GENERATE_IMPROVEMENTS",
  "REWRITE_COPY",
  "UPDATE_PRICING",
  "CUSTOM",
]);

async function createOptimizationRun(input: {
  actorIds: string[];
  kind: z.infer<typeof optimizationKind>;
  fields: Array<z.infer<typeof optimizationField>>;
}) {
  return actorConsoleApi<{ runId: string; queued: number }>("/actors/optimization/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

function registerRewriteTool(
  server: McpServer,
  name: "rewrite_actor_title_description" | "rewrite_actor_listing",
  description: string,
  kind: z.infer<typeof optimizationKind>,
  fields: Array<z.infer<typeof optimizationField>>,
) {
  server.tool(name, description, { apifyActorId: z.string().min(1) }, async ({ apifyActorId }) => {
    try {
      const run = await createOptimizationRun({ actorIds: [apifyActorId], kind, fields });
      return jsonResult({
        ...run,
        apifyActorId,
        fields,
        note: "This creates reviewable proposals only. Use get_actor_optimization_run before apply_actor_changes.",
      });
    } catch (error) {
      return errorResult(`Failed to ${name.replaceAll("_", " ")}`, String(error));
    }
  });
}

export function registerOptimizeTools(server: McpServer) {
  server.tool(
    "analyze_actor",
    "Analyze an Actor listing and create reviewable improvement proposals without applying changes.",
    { apifyActorId: z.string().min(1) },
    async ({ apifyActorId }) => {
      try {
        return jsonResult(
          await createOptimizationRun({
            actorIds: [apifyActorId],
            kind: "GENERATE_IMPROVEMENTS",
            fields: ["title", "description", "pricing"],
          }),
        );
      } catch (error) {
        return errorResult("Failed to analyze actor", String(error));
      }
    },
  );

  registerRewriteTool(
    server,
    "rewrite_actor_title_description",
    "Create reviewable title and description proposals for an Actor.",
    "REWRITE_COPY",
    ["title", "description"],
  );
  registerRewriteTool(
    server,
    "rewrite_actor_listing",
    "Create reviewable title and description proposals for an Actor.",
    "GENERATE_IMPROVEMENTS",
    ["title", "description"],
  );
  server.tool(
    "create_actor_optimization_run",
    "Create a proposal-generation run for one or more Actors and selected fields.",
    {
      actorIds: z.array(z.string().min(1)).min(1).max(10_000),
      kind: optimizationKind.optional().default("CUSTOM"),
      fields: z.array(optimizationField).min(1),
    },
    async (input) => {
      try {
        return jsonResult(await createOptimizationRun(input));
      } catch (error) {
        return errorResult("Failed to create actor optimization run", String(error));
      }
    },
  );

  server.tool(
    "get_actor_optimization_run",
    "Get proposal details, scores, issues, and application status for an optimization run.",
    { runId: z.string().min(1) },
    async ({ runId }) => {
      try {
        return jsonResult(
          await actorConsoleApi(`/actors/optimization/runs/${encodeURIComponent(runId)}`),
        );
      } catch (error) {
        return errorResult("Failed to get actor optimization run", String(error));
      }
    },
  );

  server.tool(
    "apply_actor_changes",
    "Explicitly approve selected proposal fields and queue their application to Apify. This is a mutating operation.",
    {
      runId: z.string().min(1),
      items: z
        .array(z.object({ resultId: z.string().min(1), fields: z.array(optimizationField).min(1) }))
        .min(1),
      idempotencyKey: z.string().min(8).max(191),
    },
    async ({ runId, items, idempotencyKey }) => {
      try {
        return jsonResult(
          await actorConsoleApi(`/actors/optimization/runs/${encodeURIComponent(runId)}/approve`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": idempotencyKey,
            },
            body: JSON.stringify({ items }),
          }),
        );
      } catch (error) {
        return errorResult("Failed to apply actor changes", String(error));
      }
    },
  );

  server.tool(
    "get_actor_change_status",
    "Get the current generation or application status for an Actor optimization run.",
    { runId: z.string().min(1) },
    async ({ runId }) => {
      try {
        return jsonResult(
          await actorConsoleApi(`/actors/optimization/runs/${encodeURIComponent(runId)}`),
        );
      } catch (error) {
        return errorResult("Failed to get actor change status", String(error));
      }
    },
  );
}
