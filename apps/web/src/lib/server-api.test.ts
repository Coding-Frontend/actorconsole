import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=present" })),
}));

import { authenticatedServerFetch } from "./server-api";

describe("authenticatedServerFetch", () => {
  it("allows bounded financial report reads to finish without extending other requests", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await authenticatedServerFetch("/actors/costs?from=2026-09-07");
    expect(timeout).toHaveBeenLastCalledWith(30_000);
    await authenticatedServerFetch("/actors/revenue");
    expect(timeout).toHaveBeenLastCalledWith(30_000);
    await authenticatedServerFetch("/actors/usage/sync", { method: "POST" });
    expect(timeout).toHaveBeenLastCalledWith(12_000);
    await authenticatedServerFetch("/apify/status");
    expect(timeout).toHaveBeenLastCalledWith(12_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries transient read responses and honors Retry-After", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await authenticatedServerFetch("/actors/usage");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.cache).toBe("no-store");
    expect(requestInit.headers).toBeInstanceOf(Headers);
    expect((requestInit.headers as Headers).get("cookie")).toBe("session=present");
    expect((requestInit.headers as Headers).get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does not replay mutation requests", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("busy", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await authenticatedServerFetch("/actors/sync", { method: "POST" });

    expect(response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
