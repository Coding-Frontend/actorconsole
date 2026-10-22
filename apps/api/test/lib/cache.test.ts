import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cached,
  CACHE_MISS,
  cacheDelete,
  cacheGet,
  cacheSet,
  clearMemoryCache,
} from "../../src/lib/cache.js";

// Mock ./queue so getRedis() returns null in tests (in-memory mode).
// This keeps the tests independent of any Redis instance.

vi.mock("../../src/lib/queue.js", () => ({
  getRedis: () => null,
}));

describe("cache (in-memory fallback)", () => {
  beforeEach(() => {
    clearMemoryCache();
  });

  afterEach(() => {
    clearMemoryCache();
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

  it("cacheDelete removes the entry", async () => {
    await cacheSet("k1", "value", 60);
    await cacheDelete("k1");
    const out = await cacheGet<string>("k1");
    expect(out).toBe(CACHE_MISS);
  });

  describe("cached() wrapper", () => {
    it("returns the cached value on the second call without invoking the loader", async () => {
      const loader = vi.fn().mockResolvedValue("fresh");
      const a = await cached("k1", 60, loader);
      const b = await cached("k1", 60, loader);
      expect(a).toBe("fresh");
      expect(b).toBe("fresh");
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("invokes the loader on cache miss", async () => {
      const loader = vi.fn().mockResolvedValue(42);
      const a = await cached("k1", 60, loader);
      expect(a).toBe(42);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("propagates loader errors (cache write never silently swallows)", async () => {
      const loader = vi.fn().mockRejectedValue(new Error("boom"));
      await expect(cached("k1", 60, loader)).rejects.toThrow("boom");
    });
  });
});
