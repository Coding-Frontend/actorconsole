import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the public (anonymous) Apify lookups.
 *
 * We mock ./client at module level so that any call to
 * `createApifyClient()` (including the lazy singleton inside
 * `anon()`) returns our shared mock with controllable spies.
 */

const mockGetActor = vi.fn();
const mockGetPublicUser = vi.fn();
const mockGetLatestPublicRun = vi.fn();

vi.mock("./client.js", () => ({
  createApifyClient: () => ({
    getActor: mockGetActor,
    getPublicUser: mockGetPublicUser,
    getLatestPublicRun: mockGetLatestPublicRun,
  }),
}));

import {
  getPublicActor,
  getPublicUser,
  getLatestPublicRun,
  clearPublicCache,
  publicCacheSize,
} from "./public.js";

describe("@actorconsole/apify/public", () => {
  beforeEach(() => {
    mockGetActor.mockReset();
    mockGetPublicUser.mockReset();
    mockGetLatestPublicRun.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearPublicCache();
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

  describe("getPublicUser", () => {
    it("returns null for empty username without calling client", async () => {
      expect(await getPublicUser("")).toBeNull();
      expect(mockGetPublicUser).not.toHaveBeenCalled();
    });

    it("delegates non-empty username", async () => {
      mockGetPublicUser.mockResolvedValue({ id: "u1" } as never);
      await getPublicUser("alice");
      expect(mockGetPublicUser).toHaveBeenCalledWith("alice");
    });
  });

  describe("getLatestPublicRun", () => {
    it("returns null for malformed input", async () => {
      expect(await getLatestPublicRun("nope")).toBeNull();
    });

    it("delegates valid input", async () => {
      mockGetLatestPublicRun.mockResolvedValue({ id: "r1" } as never);
      await getLatestPublicRun("alice~my-actor");
      expect(mockGetLatestPublicRun).toHaveBeenCalledWith("alice/my-actor");
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
      expect(publicCacheSize()).toBeGreaterThanOrEqual(1);
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

    it("clearPublicCache wipes the in-process map", async () => {
      mockGetActor.mockResolvedValue({ id: "abc" } as never);
      await getPublicActor("alice~my-actor");
      expect(publicCacheSize()).toBe(1);
      clearPublicCache();
      expect(publicCacheSize()).toBe(0);
      await getPublicActor("alice~my-actor");
      expect(mockGetActor).toHaveBeenCalledTimes(2);
    });

    it("caches getPublicUser results", async () => {
      mockGetPublicUser.mockResolvedValue({ id: "u1" } as never);
      await getPublicUser("alice");
      await getPublicUser("alice");
      expect(mockGetPublicUser).toHaveBeenCalledTimes(1);
    });

    it("caches getLatestPublicRun results", async () => {
      mockGetLatestPublicRun.mockResolvedValue({ id: "r1" } as never);
      await getLatestPublicRun("alice~my-actor");
      await getLatestPublicRun("alice~my-actor");
      expect(mockGetLatestPublicRun).toHaveBeenCalledTimes(1);
    });
  });
});
