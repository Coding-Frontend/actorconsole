import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

/**
 * Tests for /keywords/search — persisted Store catalog search.
 */

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    storeActor: {
      findMany: vi.fn(),
    },
    keywordSearch: {
      create: vi.fn(),
      count: vi.fn(),
    },
    keywordWatch: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@actorconsole/db", () => ({ db: mockDb }));

import { keywordRoutes } from "../../src/routes/keywords.js";

function buildApp() {
  const app = new Hono();
  app.use("/*", async (c: any, next: any) => {
    c.set("session", { userId: "user_test_1", email: "t@a.com", plan: "FREE" });
    await next();
  });
  app.onError(onErrorHandler);
  app.route("/", keywordRoutes);
  return app;
}

function catalogRow(overrides: Record<string, unknown> = {}) {
  return {
    apifyActorId: "username~actor",
    username: "username",
    actorName: "actor",
    title: "Cool Actor",
    description: "Does cool things",
    pictureUrl: null,
    ownerName: "Builder",
    ownerPictureUrl: null,
    apifyCreatedAt: null,
    firstPublishedAt: null,
    apifyModifiedAt: null,
    totalRuns: 1_000,
    totalUsers: 500,
    users7Days: 40,
    users30Days: 75,
    users90Days: 180,
    runs30Days: 300,
    reviewCount: 14,
    reviewRating: 4.7,
    bookmarkCount: 32,
    categories: [],
    metaLabels: ["POPULAR"],
    pricingInfos: [],
    lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("keywords", () => {
  beforeEach(() => {
    mockDb.storeActor.findMany.mockReset().mockResolvedValue([]);
    mockDb.keywordSearch.create.mockReset().mockResolvedValue({ id: "search_1" });
    mockDb.keywordSearch.count.mockReset().mockResolvedValue(1);
    mockDb.keywordWatch.findUnique.mockReset().mockResolvedValue(null);
    mockDb.keywordWatch.update.mockReset().mockResolvedValue({ id: "watch_1" });
    mockDb.keywordWatch.findMany.mockReset().mockResolvedValue([]);
    mockDb.keywordWatch.create.mockReset().mockResolvedValue({ id: "watch_1", keyword: "cool" });
    mockDb.keywordWatch.deleteMany.mockReset().mockResolvedValue({ count: 1 });
  });

  describe("GET /search", () => {
    it("returns mapped results from the persisted Store catalog", async () => {
      mockDb.storeActor.findMany.mockResolvedValueOnce([catalogRow()]);

      const res = await buildApp().request("/search?q=cool");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: "username~actor",
        title: "Cool Actor",
        totalRuns: 1_000,
        usersTotal: 500,
        users30Days: 75,
        users90Days: 180,
        rating: 4.7,
        reviewCount: 14,
        bookmarkCount: 32,
        metaLabels: ["POPULAR"],
      });
      expect(body.meta).toMatchObject({
        keyword: "cool",
        searchVolume: 1,
        difficultyScore: expect.any(Number),
        historicalCoverage: 0,
      });
      expect(body.meta.methodology).toContain("persisted Apify Store catalog");
      expect(mockDb.storeActor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 240 }),
      );
    });

    it("adds persisted snapshot history to catalog demand signals", async () => {
      mockDb.storeActor.findMany
        .mockResolvedValueOnce([
          catalogRow({
            apifyActorId: "actor_1",
            username: "builder",
            actorName: "maps-scraper",
            title: "Maps Scraper",
            totalRuns: 12_000,
            totalUsers: 900,
            users30Days: 240,
            reviewCount: null,
            reviewRating: 4.8,
            metaLabels: [],
          }),
        ])
        .mockResolvedValueOnce([
          {
            apifyActorId: "actor_1",
            username: "builder",
            actorName: "maps-scraper",
            snapshots: [
              { users30Days: 240, totalUsers: 900 },
              { users30Days: 200, totalUsers: 820 },
            ],
          },
        ]);

      const res = await buildApp().request("/search?q=maps");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data[0]).toMatchObject({
        totalRuns: 12_000,
        historyPoints: 2,
        demandTrendPercent: 20,
        historicalMonthlyUsers: 240,
      });
      expect(body.meta).toMatchObject({
        historicalCoverage: 1,
        averageDemandTrendPercent: 20,
      });
      expect(mockDb.storeActor.findMany).toHaveBeenCalledTimes(2);
    });

    it("works from the catalog without a connected Apify account", async () => {
      const res = await buildApp().request("/search?q=anything");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta.resultCount).toBe(0);
    });

    it("rejects a limit over 50 with 400 (Zod max constraint)", async () => {
      const res = await buildApp().request("/search?q=x&limit=9999");
      expect(res.status).toBe(400);
    });

    it("accepts limit=50 and bounds the catalog candidate query", async () => {
      const res = await buildApp().request("/search?q=x&limit=50");
      expect(res.status).toBe(200);
      expect(mockDb.storeActor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 }),
      );
    });

    it("rejects an empty query with 400", async () => {
      const res = await buildApp().request("/search?q=");
      expect(res.status).toBe(400);
    });
  });

  it("loads comparison signals without recording another keyword search", async () => {
    mockDb.storeActor.findMany.mockResolvedValueOnce([catalogRow()]);

    const res = await buildApp().request("/compare?q=cool");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      title: "Cool Actor",
      monthlyUsers: 75,
      opportunityScore: expect.any(Number),
    });
    expect(mockDb.keywordSearch.create).not.toHaveBeenCalled();
    expect(mockDb.keywordSearch.count).not.toHaveBeenCalled();
  });

  describe("watchlist", () => {
    it("creates and lists a persistent watch", async () => {
      const create = await buildApp().request("/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: "Google   Maps" }),
      });
      expect(create.status).toBe(201);
      expect(mockDb.keywordWatch.create).toHaveBeenCalledWith({
        data: {
          userId: "user_test_1",
          keyword: "Google   Maps",
          normalizedKeyword: "google maps",
        },
      });

      const list = await buildApp().request("/watchlist");
      expect(list.status).toBe(200);
      expect((await list.json()).data).toEqual([]);
    });

    it("deletes only the current user's watch", async () => {
      const res = await buildApp().request("/watchlist/watch_1", { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(mockDb.keywordWatch.deleteMany).toHaveBeenCalledWith({
        where: {
          id: "watch_1",
          userId: "user_test_1",
          businessProfileId: "__workspace_required__",
        },
      });
    });
  });
});
