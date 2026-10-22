import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCP_TOOL_NAMES } from "@actorconsole/shared/mcp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server.js";
import { apiFixture, toolCases } from "./tool-cases.mjs";

const requests: Array<{ url: URL; init: RequestInit }> = [];
let client: Client;
let server: Awaited<ReturnType<typeof createServer>>;
let denied = false;

beforeEach(async () => {
  requests.length = 0;
  denied = false;
  vi.stubEnv("ACTORCONSOLE_API_KEY", `al_${"a".repeat(64)}`);
  vi.stubEnv("API_BASE_URL", "https://api.actorconsole.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      return new Response(
        JSON.stringify(
          denied
            ? { ok: false, error: { message: "Permission denied" } }
            : { ok: true, data: apiFixture(url.pathname), meta: { difficultyScore: 42 } },
        ),
        {
          status: denied ? 403 : 200,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  server = await createServer();
  client = new Client({ name: "all-tools-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await server.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Complete MCP tool surface", () => {
  it("has an endpoint contract for every documented tool", () => {
    expect(Object.keys(toolCases).sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  for (const [name, contract] of Object.entries(toolCases)) {
    it(`${name} calls the intended authenticated API contract`, async () => {
      const result = await client.callTool({ name, arguments: contract.args });
      expect(result.isError).not.toBe(true);
      const request = requests.at(-1)!;
      expect(request.url.pathname).toBe(contract.path);
      expect(request.init.method ?? "GET").toBe(contract.method);
      expect(new Headers(request.init.headers).get("authorization")).toBe(
        `Bearer al_${"a".repeat(64)}`,
      );
      for (const [key, value] of Object.entries(contract.query ?? {})) {
        expect(request.url.searchParams.get(key)).toBe(value);
      }
      if (contract.body) expect(JSON.parse(String(request.init.body))).toMatchObject(contract.body);
      if (contract.idempotency) {
        expect(new Headers(request.init.headers).get("idempotency-key")).toBe("mcp-contract-key");
      }
    });

    it(`${name} stops before its operation when access is denied`, async () => {
      denied = true;
      const result = await client.callTool({ name, arguments: contract.args });
      expect(result.isError).toBe(true);
      expect(requests).toHaveLength(1);
      expect(requests[0].url.pathname).toBe("/mcp/info");
      expect(requests[0].init.method ?? "GET").toBe("GET");
    });
  }
});
