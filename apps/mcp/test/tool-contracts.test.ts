import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server.js";

const requests: Array<{ path: string; method: string; body: unknown }> = [];
let client: Client;
let closeServer: () => Promise<void>;

function resultJson(result: Awaited<ReturnType<Client["callTool"]>>) {
  expect(result.isError).not.toBe(true);
  const content = result.content?.[0];
  expect(content?.type).toBe("text");
  return JSON.parse(content && "text" in content ? content.text : "null") as Record<string, any>;
}

beforeEach(async () => {
  requests.length = 0;
  process.env.ACTORCONSOLE_API_KEY = `al_${"a".repeat(64)}`;
  process.env.API_BASE_URL = "https://api.actorconsole.test";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const data =
        path === "/mcp/info"
          ? {
              name: "actorconsole-mcp",
              version: "0.2.0",
              transport: "stdio",
              permissions: ["pricing:read", "pricing:write", "usage:read", "actors:read"],
              actorScope: "all",
              tools: ["get_pricing", "get_actor_revenue"],
              resources: ["actorconsole://actors"],
              prompts: ["review_deprecated_actors"],
            }
          : path === "/keywords/search"
            ? [{ id: "public-actor", demandScore: 71 }]
            : path === "/actors/revenue"
              ? {
                  filters: { actorIds: ["a1"] },
                  report: { points: [{ period: "2026-09-25", revenueUsd: 7 }] },
                  revenue: {
                    syncedAt: "2026-09-25T00:00:00.000Z",
                    actors: [{ apifyActorId: "owner~actor", revenueUsd: 7, netProfitUsd: 5 }],
                    daily: [{ date: "2026-09-25", revenueUsd: 7 }],
                    coverage: { selectedActors: 1 },
                    ledgerTruncated: false,
                  },
                }
              : path.endsWith("/pricing/history")
                ? { apifyActorId: "owner~actor", pricing: [{ id: "price-1" }] }
                : path.endsWith("/pricing") && method === "GET"
                  ? { apifyActorId: "owner~actor", pricing: { model: "PAY_PER_EVENT" } }
                  : { ok: true };
      return new Response(
        JSON.stringify({
          ok: true,
          data,
          ...(path === "/keywords/search" ? { meta: { difficultyScore: 42, resultCount: 1 } } : {}),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = await createServer();
  client = new Client({ name: "mcp-tool-contracts", version: "1.0.0" });
  closeServer = () => server.close();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await closeServer();
  vi.unstubAllGlobals();
  delete process.env.ACTORCONSOLE_API_KEY;
  delete process.env.API_BASE_URL;
});

describe("MCP tool contracts", () => {
  it("returns capability filtered tools, resources, and prompts", async () => {
    const result = resultJson(
      await client.callTool({ name: "get_mcp_capabilities", arguments: {} }),
    );
    expect(result).toMatchObject({
      tools: ["get_pricing", "get_actor_revenue"],
      resources: ["actorconsole://actors"],
      prompts: ["review_deprecated_actors"],
    });
  });

  it("retains keyword search summary metrics", async () => {
    const search = resultJson(
      await client.callTool({
        name: "search_actors",
        arguments: { query: "maps" },
      }),
    );
    const competitors = resultJson(
      await client.callTool({
        name: "keyword_competitors",
        arguments: { keyword: "maps" },
      }),
    );
    expect(search).toMatchObject({
      items: [{ id: "public-actor" }],
      metrics: { difficultyScore: 42 },
    });
    expect(competitors).toMatchObject({
      keyword: "maps",
      competitors: [{ id: "public-actor" }],
      metrics: { difficultyScore: 42 },
    });
  });

  it("reads pricing with pricing-only endpoints and preserves pay-per-event flags", async () => {
    resultJson(
      await client.callTool({ name: "get_pricing", arguments: { apifyActorId: "owner~actor" } }),
    );
    resultJson(
      await client.callTool({
        name: "get_pricing_history",
        arguments: { apifyActorId: "owner~actor", limit: 60 },
      }),
    );
    resultJson(
      await client.callTool({
        name: "set_pricing",
        arguments: {
          apifyActorId: "owner~actor",
          pricing: {
            model: "PAY_PER_EVENT",
            events: {
              result: {
                eventTitle: "Result",
                eventPriceUsd: 0.01,
                isPrimaryEvent: true,
                isOneTimeEvent: false,
              },
            },
          },
        },
      }),
    );
    expect(
      requests.some(
        (request) => request.path === "/actors/owner~actor/pricing" && request.method === "GET",
      ),
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.path === "/actors/owner~actor/pricing/history" && request.method === "GET",
      ),
    ).toBe(true);
    expect(requests.find((request) => request.method === "PUT")?.body).toMatchObject({
      pricing: { events: { result: { isPrimaryEvent: true, isOneTimeEvent: false } } },
    });
  });

  it("returns creator revenue from the financial report", async () => {
    const result = resultJson(
      await client.callTool({
        name: "get_actor_revenue",
        arguments: { apifyActorId: "owner~actor", limit: 30 },
      }),
    );
    expect(result).toMatchObject({
      actor: { apifyActorId: "owner~actor", revenueUsd: 7, netProfitUsd: 5 },
      report: { points: [{ revenueUsd: 7 }] },
    });
    expect(requests.some((request) => request.path === "/actors/revenue")).toBe(true);
    expect(requests.some((request) => request.path === "/actors/owner~actor")).toBe(false);
  });
});
