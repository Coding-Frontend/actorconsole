import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock ./queue so getRedis() returns null in tests (in-memory mode).
// This keeps the tests independent of any Redis instance.

vi.mock("../../src/lib/queue.js", () => ({
  getRedis: () => null,
}));

type CacheModule = typeof import("../../src/lib/cache.js");
let CACHE_MISS: CacheModule["CACHE_MISS"];
let cacheGet: CacheModule["cacheGet"];
let cacheSet: CacheModule["cacheSet"];

describe("cache (in-memory fallback)", () => {
  beforeEach(async () => {
    // A fresh module instance gives every test its own empty in-memory cache.
    vi.resetModules();
    ({ CACHE_MISS, cacheGet, cacheSet } = await import("../../src/lib/cache.js"));
  });

  it("returns CACHE_MISS when the key is absent", async () => {
    const out = await cacheGet<string>("nope");
    expect(out).toBe(CACHE_MISS);
  });

  it("stores and retrieves a string value", async () => {
    await cacheSet("k1", "hello", 60);
    const out = await cacheGet<string>("k1");
    expect(out).toBe("hello");
  });

  it("stores and retrieves an object value", async () => {
    await cacheSet("k1", { a: 1, b: "two" }, 60);
    const out = await cacheGet<{ a: number; b: string }>("k1");
    expect(out).toEqual({ a: 1, b: "two" });
  });

  it("stores and retrieves null without confusing it with a miss", async () => {
    await cacheSet<string | null>("k1", null, 60);
    const out = await cacheGet<string | null>("k1");
    expect(out).toBeNull();
  });

  it("expires entries after their TTL", async () => {
    // ttlSeconds=0 means the entry expires immediately; the Date.now()
    // check uses ms-precision, so a tiny wait guarantees the expiry.
    await cacheSet("k1", "value", 0);
    await new Promise((r) => setTimeout(r, 5));
    const out = await cacheGet<string>("k1");
    expect(out).toBe(CACHE_MISS);
  });
});
