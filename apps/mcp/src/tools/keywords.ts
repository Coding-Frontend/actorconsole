import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actorConsoleApiEnvelope } from "../lib/actorconsole-api.js";
import { jsonResult, errorResult } from "../lib/respond.js";

export function registerKeywordTools(server: McpServer) {
  server.tool(
    "search_actors",
    "Search the synchronized public Apify Store catalog and return matching Actors plus demand and difficulty metrics.",
    {
      query: z.string().trim().min(1).max(120),
      limit: z.number().int().min(1).max(50).optional().default(20),
    },
    async ({ query, limit }) => {
      try {
        const result = await actorConsoleApiEnvelope<unknown>(
          `/keywords/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        );
        return jsonResult({ items: result.data, metrics: result.meta ?? null });
      } catch (err) {
        return errorResult("Failed to search actors", String(err));
      }
    },
  );

  server.tool(
    "keyword_competitors",
    "Get matching public Store Actors and catalog demand/difficulty metrics for a keyword.",
    {
      keyword: z.string().trim().min(1).max(120),
      limit: z.number().int().min(1).max(50).optional().default(20),
    },
    async ({ keyword, limit }) => {
      try {
        const result = await actorConsoleApiEnvelope<unknown>(
          `/keywords/search?q=${encodeURIComponent(keyword)}&limit=${limit}`,
        );
        return jsonResult({ keyword, competitors: result.data, metrics: result.meta ?? null });
      } catch (err) {
        return errorResult("Failed to fetch competitors", String(err));
      }
    },
  );
}
