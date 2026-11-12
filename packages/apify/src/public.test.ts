import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the public (anonymous) Apify lookups.
 *
 * We mock ./client at module level so that any call to
 * `createApifyClient()` (including the lazy singleton inside
 * `anon()`) returns our shared mock with controllable spies.
 * Each test re-imports ./public so it starts with an empty cache.
 */

const mockGetActor = vi.fn();

vi.mock("./client.js", () => ({
  createApifyClient: () => ({
    getActor: mockGetActor,
  }),
}));

type PublicModule = typeof import("./public.js");
let getPublicActor: PublicModule["getPublicActor"];
let PUBLIC_CACHE_MAX_ENTRIES: PublicModule["PUBLIC_CACHE_MAX_ENTRIES"];

describe("@actorconsole/apify/public", () => {
  it("bounds successful and negative entries even for unique arbitrary lookups", async () => {
    mockGetActor.mockResolvedValue(null);
    for (let index = 0; index < PUBLIC_CACHE_MAX_ENTRIES + 20; index++) await getPublicActor(`owner/actor-${index}`);
    mockGetActor.mockClear();
    // The oldest lookups were evicted to stay within the bound; the newest is still cached.
    await getPublicActor("owner/actor-0");
    await getPublicActor(`owner/actor-${PUBLIC_CACHE_MAX_ENTRIES + 19}`);
    expect(mockGetActor).toHaveBeenCalledTimes(1);
    expect(mockGetActor).toHaveBeenCalledWith("owner/actor-0");
  });
  it("coalesces simultaneous lookups for the same canonical Actor", async () => {
    mockGetActor.mockResolvedValue({ id: "one" });
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => getPublicActor(index % 2 ? "owner/coalesced" : "owner~coalesced")));
    expect(results.every((value) => value?.id === "one")).toBe(true);
    expect(mockGetActor).toHaveBeenCalledOnce();
  });
  it.each(["owner/actor/extra", "../actor", "owner/" + "x".repeat(101), "owner/actor?param=1"])("rejects malformed identifiers before cache/network use: %s", async (value) => {
    expect(await getPublicActor(value)).toBeNull();
    expect(mockGetActor).not.toHaveBeenCalled();
  });
  beforeEach(async () => {
    mockGetActor.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    ({ getPublicActor, PUBLIC_CACHE_MAX_ENTRIES } = await import("./public.js"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPublicActor", () => {
    it("returns null for malformed input (no slash)", async () => {
      const out = await getPublicActor("notavalidactor");
      expect(out).toBeNull();
      expect(mockGetActor).not.toHaveBeenCalled();
    });

    it("returns null for empty input", async () => {
      expect(await getPublicActor("")).toBeNull();
    });

    it("splits user~actor and calls client.getActor", async () => {
      mockGetActor.mockResolvedValue({ id: "abc" } as never);
      await getPublicActor("alice~my-actor");
      expect(mockGetActor).toHaveBeenCalledWith("alice/my-actor");
    });

    it("swallows non-404 errors and returns null", async () => {
      mockGetActor.mockRejectedValue(new Error("ECONNRESET"));
      const out = await getPublicActor("alice~my-actor");
      expect(out).toBeNull();
    });
  });

  describe("in-process TTL cache", () => {
    it("caches getPublicActor results for the second call", async () => {
      mockGetActor.mockResolvedValue({ id: "abc" } as never);
      const a = await getPublicActor("alice~my-actor");
      const b = await getPublicActor("alice~my-actor");
      expect(a).toEqual({ id: "abc" });
      expect(b).toEqual({ id: "abc" });
      // Only one network call thanks to the cache
      expect(mockGetActor).toHaveBeenCalledTimes(1);
    });

    it("bypassCache forces a fresh call", async () => {
      mockGetActor.mockResolvedValue({ id: "abc" } as never);
      await getPublicActor("alice~my-actor");
      await getPublicActor("alice~my-actor", { bypassCache: true });
      expect(mockGetActor).toHaveBeenCalledTimes(2);
    });

    it("honours custom ttlMs (short TTL expires immediately)", async () => {
      mockGetActor.mockResolvedValue({ id: "abc" } as never);
      await getPublicActor("alice~my-actor", { ttlMs: 1 });
      // tiny sleep to let TTL elapse
      await new Promise((r) => setTimeout(r, 5));
      await getPublicActor("alice~my-actor");
      expect(mockGetActor).toHaveBeenCalledTimes(2);
    });

    it("caches null results so a transient outage doesn't re-fire", async () => {
      mockGetActor.mockRejectedValue(new Error("ECONNRESET"));
      await getPublicActor("alice~my-actor");
      await getPublicActor("alice~my-actor");
      // Only one attempt was made (the second call hit the cached null)
      expect(mockGetActor).toHaveBeenCalledTimes(1);
    });
  });
});
