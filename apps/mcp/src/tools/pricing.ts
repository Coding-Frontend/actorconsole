import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { actorPricingSchema } from "@actorconsole/shared";
import { z } from "zod";
import { actorConsoleApi } from "../lib/actorconsole-api.js";
import { jsonResult, errorResult } from "../lib/respond.js";

export function registerPricingTools(server: McpServer) {
  server.tool(
    "set_pricing",
    "Update an actor's pricing on the Apify Store through ActorConsole and record the change history.",
    {
      apifyActorId: z.string().min(1),
      pricing: actorPricingSchema.describe("Pay-per-event pricing configuration"),
      reason: z.string().optional().describe("Why this change is being made"),
    },
    async ({ apifyActorId, pricing, reason }) => {
      try {
        const updated = await actorConsoleApi<unknown>(
          `/actors/${encodeURIComponent(apifyActorId)}/pricing`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pricing, reason }),
          },
        );
        return jsonResult({ ok: true, apifyActorId, pricing, updated });
      } catch (err) {
        return errorResult("Failed to set pricing", String(err));
      }
    },
  );

  server.tool(
    "get_pricing",
    "Read synchronized current pricing for a tracked Actor.",
    { apifyActorId: z.string().min(1) },
    async ({ apifyActorId }) => {
      try {
        return jsonResult(
          await actorConsoleApi(`/actors/${encodeURIComponent(apifyActorId)}/pricing`),
        );
      } catch (err) {
        return errorResult("Failed to get pricing", String(err));
      }
    },
  );

  server.tool(
    "recommend_pricing",
    "Compare live Store competitors and return a reviewable median-price recommendation without changing the actor.",
    { apifyActorId: z.string().min(1) },
    async ({ apifyActorId }) => {
      try {
        const result = await actorConsoleApi<unknown>(
          `/actors/${encodeURIComponent(apifyActorId)}/pricing/recommendation`,
        );
        return jsonResult(result);
      } catch (err) {
        return errorResult("Failed to recommend pricing", String(err));
      }
    },
  );

  server.tool(
    "get_pricing_history",
    "Get up to 180 recorded pricing changes for a tracked Actor, newest first.",
    {
      apifyActorId: z.string().min(1),
      limit: z.number().int().min(1).max(180).optional().default(60),
    },
    async ({ apifyActorId, limit }) => {
      try {
        return jsonResult(
          await actorConsoleApi(
            `/actors/${encodeURIComponent(apifyActorId)}/pricing/history?limit=${limit}`,
          ),
        );
      } catch (error) {
        return errorResult("Failed to get pricing history", String(error));
      }
    },
  );
}
