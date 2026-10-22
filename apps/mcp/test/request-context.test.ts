import { afterEach, describe, expect, it, vi } from "vitest";
import { actorConsoleApi } from "../src/lib/actorconsole-api.js";
import { runWithMcpRequestContext } from "../src/lib/request-context.js";

describe("MCP request authentication context", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_BASE_URL;
    delete process.env.ACTORCONSOLE_API_KEY;
  });

  it("keeps concurrent HTTP credentials isolated and verifies access once per request", async () => {
    process.env.API_BASE_URL = "https://api.actorconsole.test";
    const calls: Array<{ path: string; authorization: string | null; requestId: string | null }> =
      [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        const headers = new Headers(init?.headers);
        calls.push({
          path: url.pathname,
          authorization: headers.get("authorization"),
          requestId: headers.get("x-request-id"),
        });
        return new Response(JSON.stringify({ ok: true, data: { path: url.pathname } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    await Promise.all([
      runWithMcpRequestContext(
        { actorConsoleApiKey: "al_" + "a".repeat(64), requestId: "request-a", transport: "http" },
        async () => {
          await actorConsoleApi("/actors");
          await actorConsoleApi("/actors/a");
        },
      ),
      runWithMcpRequestContext(
        { actorConsoleApiKey: "al_" + "b".repeat(64), requestId: "request-b", transport: "http" },
        () => actorConsoleApi("/actors/b"),
      ),
    ]);

    expect(calls.filter((call) => call.path === "/mcp/info")).toHaveLength(2);
    expect(calls.filter((call) => call.requestId === "request-a")).toHaveLength(3);
    expect(calls.filter((call) => call.requestId === "request-b")).toHaveLength(2);
    expect(
      calls
        .filter((call) => call.requestId === "request-a")
        .every((call) => call.authorization === `Bearer al_${"a".repeat(64)}`),
    ).toBe(true);
    expect(
      calls
        .filter((call) => call.requestId === "request-b")
        .every((call) => call.authorization === `Bearer al_${"b".repeat(64)}`),
    ).toBe(true);
  });

  it("uses ACTORCONSOLE_API_KEY for local stdio mode", async () => {
    process.env.API_BASE_URL = "https://api.actorconsole.test";
    process.env.ACTORCONSOLE_API_KEY = `al_${"c".repeat(64)}`;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer al_${"c".repeat(64)}`);
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await actorConsoleApi("/actors");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
