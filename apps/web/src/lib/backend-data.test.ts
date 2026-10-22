import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeApiData } from "@actorconsole/shared/api-data";

const cacheState = vi.hoisted(() => ({ values: new Map<string, unknown>(), configuration: {} as { revalidate?: number; tags?: string[] } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...args: string[]) => Promise<unknown>, _keys: string[], options: typeof cacheState.configuration) => {
  cacheState.configuration = options;
  return async (...args: string[]) => {
    const key = JSON.stringify(args);
    if (cacheState.values.has(key)) return cacheState.values.get(key);
    const data = await fn(...args);
    cacheState.values.set(key, JSON.parse(JSON.stringify(data)));
    return data;
  };
} }));
import { backendData } from "./backend-data";

beforeEach(() => cacheState.values.clear());
afterEach(() => vi.unstubAllGlobals());
describe("public backend data caching", () => {
  it("collapses parallel metadata/page reads and reuses successful public values", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { total: 42 } }));
    vi.stubGlobal("fetch", fetch);
    const values = await Promise.all(Array.from({ length: 20 }, () => backendData("summary")));
    expect(values.every((value) => (value as { total: number }).total === 42)).toBe(true);
    await backendData("summary");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cacheState.configuration).toEqual({ revalidate: 60, tags: ["actorconsole-public-catalog"] });
  });
  it("separates public filters and retains Dates and Maps through serialization", async () => {
    const date = new Date("2026-10-06T00:00:00Z");
    const fetch = vi.fn().mockImplementation(async (url: URL) => Response.json({ ok: true, data: encodeApiData(new Map([[url.searchParams.get("args"), date]])) }));
    vi.stubGlobal("fetch", fetch);
    const first = await backendData<Map<string, Date>>("comparison-history", [["alice"], 7]);
    await backendData("comparison-history", [["bob"], 7]);
    const repeated = await backendData<Map<string, Date>>("comparison-history", [["alice"], 7]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(first).toBeInstanceOf(Map);
    expect([...repeated.values()][0]).toEqual(date);
    expect([...repeated.values()][0]).toBeInstanceOf(Date);
    expect(fetch.mock.calls.every(([, init]) => Object.keys(init.headers).length === 1 && init.headers["x-request-id"].startsWith("web-catalog-comparison-history-"))).toBe(true);
  });
  it("does not retain failed reads or allow private operations into the cache", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 })).mockResolvedValueOnce(Response.json({ ok: true, data: 42 }));
    vi.stubGlobal("fetch", fetch);
    await expect(backendData("summary")).rejects.toThrow("503");
    expect(await backendData("summary")).toBe(42);
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(backendData("workspace-access")).rejects.toThrow("Unknown public");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
