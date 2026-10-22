import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actorConsoleApi } from "../lib/actorconsole-api.js";
import { errorResult, jsonResult } from "../lib/respond.js";

const reportShape = {
  granularity: z.enum(["day", "month"]).optional().default("day"),
  mode: z.enum(["absolute", "cumulative"]).optional().default("absolute"),
};

function reportQuery(granularity: string, mode: string) {
  return `granularity=${encodeURIComponent(granularity)}&mode=${encodeURIComponent(mode)}`;
}

export function registerUsageTools(server: McpServer) {
  server.tool(
    "get_usage_costs",
    "Read synchronized per-Actor usage, runs, and costs with daily/monthly absolute or cumulative reporting.",
    {
      apifyActorId: z.string().min(1),
      days: z.number().int().min(1).max(365).default(30),
      ...reportShape,
    },
    async ({ apifyActorId, days, granularity, mode }) => {
      try {
        return jsonResult(
          await actorConsoleApi(
            `/actors/${encodeURIComponent(apifyActorId)}/usage?days=${days}&${reportQuery(granularity, mode)}`,
          ),
        );
      } catch (error) {
        return errorResult("Failed to fetch usage costs", String(error));
      }
    },
  );

  server.tool(
    "get_actor_performance",
    "Get cached Actor run, success, result, and cost metrics for a recent period.",
    { apifyActorId: z.string().min(1), limit: z.number().int().min(1).max(180).default(60) },
    async ({ apifyActorId, limit }) => {
      try {
        return jsonResult(
          await actorConsoleApi(
            `/actors/${encodeURIComponent(apifyActorId)}/usage?days=${Math.min(limit, 365)}`,
          ),
        );
      } catch (error) {
        return errorResult("Failed to get Actor performance", String(error));
      }
    },
  );

  server.tool(
    "get_actor_revenue",
    "Get synchronized Actor creator revenue, cost, profit, coverage, and report points for a recent period.",
    {
      apifyActorId: z.string().min(1),
      limit: z.number().int().min(1).max(180).default(90).describe("Number of recent UTC days"),
      ...reportShape,
    },
    async ({ apifyActorId, limit, granularity, mode }) => {
      try {
        const to = new Date();
        const from = new Date(to.getTime() - (limit - 1) * 86_400_000);
        const params = new URLSearchParams({
          apifyActorId,
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
          granularity,
          mode,
        });
        const result = await actorConsoleApi<{
          filters: unknown;
          report: unknown;
          revenue: {
            syncedAt: string | null;
            actors: Array<{ apifyActorId: string; [key: string]: unknown }>;
            daily: unknown[];
            coverage: unknown;
            ledgerTruncated: boolean;
          };
        }>(`/actors/revenue?${params}`);
        return jsonResult({
          apifyActorId,
          actor: result.revenue.actors.find((actor) => actor.apifyActorId === apifyActorId) ?? null,
          report: result.report,
          daily: result.revenue.daily,
          coverage: result.revenue.coverage,
          syncedAt: result.revenue.syncedAt,
          ledgerTruncated: result.revenue.ledgerTruncated,
          filters: result.filters,
        });
      } catch (error) {
        return errorResult("Failed to get Actor revenue", String(error));
      }
    },
  );

  const workspaceReportTools = [
    [
      "get_workspace_usage",
      "Get workspace usage, service costs, runs, and per-Actor breakdown.",
      "/actors/usage",
    ],
    [
      "get_workspace_revenue",
      "Get workspace revenue, cost, profit, margin, and per-Actor monetization.",
      "/actors/revenue",
    ],
    [
      "get_usage_history",
      "Get synchronized workspace usage and revenue history.",
      "/actors/usage-costs",
    ],
  ] as const;
  for (const [name, description, path] of workspaceReportTools) {
    server.tool(name, description, reportShape, async ({ granularity, mode }) => {
      try {
        return jsonResult(await actorConsoleApi(`${path}?${reportQuery(granularity, mode)}`));
      } catch (error) {
        return errorResult(`Failed to ${name.replaceAll("_", " ")}`, String(error));
      }
    });
  }
}
