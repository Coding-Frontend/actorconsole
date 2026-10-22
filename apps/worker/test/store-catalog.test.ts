import { describe, expect, it, vi } from "vitest";
import type { ApifyClientWrapper } from "@actorconsole/apify";
import {
  needsDailyStoreCatalogCatchup,
  syncStoreActorDetails,
  syncStoreSearchCatalog,
} from "../src/lib/store-catalog.js";

function databaseMock() {
  const storeActor = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "row-1", apifyActorId: "actor-1", username: "alice", actorName: "one", isPublic: true, _count: { watches: 0 } }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  };
  const storeActorSnapshot = {
    upsert: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  };
  const storeCatalogSync = {
    create: vi.fn().mockResolvedValue({ id: "sync-1" }),
    update: vi.fn().mockResolvedValue({}),
  };
  return {
    storeActor,
    storeActorSnapshot,
    storeCatalogSync,
    $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
}

describe("Apify Store catalog synchronization", () => {
  it("queues a catch-up when today's catalog search or snapshots are missing", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    expect(
      needsDailyStoreCatalogCatchup({
        now,
        latestSearchCompletedAt: new Date("2026-08-14T23:00:00.000Z"),
        latestSnapshotAt: new Date("2026-08-14T23:00:00.000Z"),
        snapshotCount: 0,
        catalogActorCount: 100,
      }),
    ).toBe(true);
    expect(
      needsDailyStoreCatalogCatchup({
        now,
        latestSearchCompletedAt: new Date("2026-08-15T01:05:00.000Z"),
        latestSnapshotAt: new Date("2026-08-15T01:06:00.000Z"),
        snapshotCount: 100,
        catalogActorCount: 100,
      }),
    ).toBe(false);
  });

  it("treats partial same-day coverage as needing another catalog catch-up", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    expect(
      needsDailyStoreCatalogCatchup({
        now,
        latestSearchCompletedAt: new Date("2026-08-15T01:05:00.000Z"),
        latestSnapshotAt: new Date("2026-08-15T01:06:00.000Z"),
        snapshotCount: 999,
        catalogActorCount: 1_000,
      }),
    ).toBe(true);
  });

  it("paginates the deterministic Algolia Search API and upserts every Actor", async () => {
    const database = databaseMock();
    database.storeActor.findMany
      .mockResolvedValueOnce([
        { id: "row-1", apifyActorId: "actor-1", username: "alice", actorName: "one" },
      ])
      .mockResolvedValueOnce([
        { id: "row-2", apifyActorId: "actor-2", username: "alice", actorName: "two" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "row-3", apifyActorId: "actor-3", username: "bob", actorName: "three" },
      ]);
    const searchStorePage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          { id: "actor-1", username: "alice", name: "one", title: "One", stats: null },
          { id: "actor-2", username: "alice", name: "two", title: "Two", stats: null },
        ],
        totalResults: 3,
      })
      .mockResolvedValueOnce({
        items: [{ id: "actor-3", username: "bob", name: "three", title: "Three", stats: null }],
        totalResults: 3,
      });

    const result = await syncStoreSearchCatalog(
      { searchStorePage } as unknown as ApifyClientWrapper,
      { pageSize: 2, database: database as never },
    );

    expect(result).toMatchObject({
      expectedCount: 3,
      processedCount: 3,
      createdCount: 2,
      updatedCount: 1,
    });
    expect(searchStorePage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ offset: 0, limit: 2, searchIndex: "algolia" }),
    );
    expect(searchStorePage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ offset: 2, limit: 2, searchIndex: "algolia" }),
    );
    expect(database.storeActor.createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: [expect.objectContaining({ apifyActorId: "actor-2" })],
        skipDuplicates: true,
      }),
    );
    expect(database.storeActor.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: [expect.objectContaining({ apifyActorId: "actor-3" })],
        skipDuplicates: true,
      }),
    );
    expect(database.storeActor.update).toHaveBeenCalledTimes(1);
    expect(database.storeActorSnapshot.upsert).toHaveBeenCalledTimes(3);
  });

  it("keeps metrics and snapshots on the immutable ID when a name is occupied", async () => {
    const database = databaseMock();
    database.storeActor.findMany.mockResolvedValueOnce([
      { id: "id-row", apifyActorId: "actor-1", username: "legacy", actorName: "old-name" },
      { id: "ref-row", apifyActorId: "legacy-id", username: "alice", actorName: "one" },
    ]);
    const searchStorePage = vi.fn().mockResolvedValue({
      items: [{ id: "actor-1", username: "alice", name: "one", title: "One", stats: null }],
      totalResults: 1,
    });

    await syncStoreSearchCatalog(
      { searchStorePage } as unknown as ApifyClientWrapper,
      { database: database as never },
    );

    expect(database.storeActor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "id-row" },
        data: expect.objectContaining({ apifyActorId: "actor-1", username: "legacy", actorName: "old-name" }),
      }),
    );
    expect(database.storeActorSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeActorId_capturedAt: expect.objectContaining({ storeActorId: "id-row" }) } }),
    );
  });

  it("enriches Store rows with Actor Details and creates daily snapshots", async () => {
    const database = databaseMock();
    database.storeActor.count.mockResolvedValueOnce(1);
    database.storeActor.findMany.mockResolvedValueOnce([
      {
        id: "row-1",
        apifyActorId: "actor-1",
        totalRuns: 75,
        totalUsers: 50,
        users7Days: 12,
        users30Days: 42,
        users90Days: 60,
        runs30Days: 84,
        reviewCount: 9,
        reviewRating: 4.5,
        bookmarkCount: 3,
      },
    ]);
    const getActor = vi.fn().mockResolvedValueOnce({
      id: "actor-1",
      username: "alice",
      name: "one",
      createdAt: "2026-07-31T12:00:00.000Z",
      firstPublishedAt: "2026-08-01T00:00:00.000Z",
      stats: {
        totalUsers: 100,
        totalUsers30Days: 25,
        publicActorRunStats30Days: { TOTAL: 50 },
      },
    });

    const result = await syncStoreActorDetails({ getActor } as unknown as ApifyClientWrapper, {
      limit: 1,
      database: database as never,
    });

    expect(result).toMatchObject({ processedCount: 1, updatedCount: 1, failedCount: 0 });
    expect(database.storeActor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          apifyCreatedAt: new Date("2026-07-31T12:00:00.000Z"),
          firstPublishedAt: new Date("2026-08-01T00:00:00.000Z"),
          // Store search is the daily leaderboard source. Detail metadata
          // must not replace the fresher rolling metrics it already saved.
          totalRuns: 75,
          totalUsers: 50,
          users30Days: 42,
          runs30Days: 84,
        }),
      }),
    );
    expect(database.storeActorSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ users30Days: 42, runs30Days: 84 }),
      }),
    );
  });

  it("limits reviewed metric repair to the requested row IDs", async () => {
    const database = databaseMock();
    database.storeActor.count.mockResolvedValue(1);
    database.storeActor.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "row-1", apifyActorId: "actor-1", users30Days: 999, totalUsers: 999 },
    ]);
    const getActor = vi.fn().mockResolvedValue({ id: "actor-1", username: "alice", name: "one", stats: { totalUsers: 100, totalUsers30Days: 25 } });
    await syncStoreActorDetails({ getActor } as unknown as ApifyClientWrapper, {
      actorIds: ["row-1"], repairMetrics: true, limit: 1, database: database as never,
    });
    expect(database.storeActor.findMany.mock.calls.every(([call]) => call.where.id.in[0] === "row-1")).toBe(true);
    expect(database.storeActor.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "row-1" }, data: expect.objectContaining({ totalUsers: 100, users30Days: 25 }),
    }));
  });

  it("reconciles complete catalog discovery with the official Actor sitemap", async () => {
    const database = databaseMock();
    database.storeActor.findMany.mockResolvedValue([]);
    const searchStorePage = vi.fn().mockResolvedValue({
      items: [],
      totalResults: 2,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          "<sitemapindex><loc>https://apify.com/sitemap/actors1.xml</loc></sitemapindex>",
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          "<urlset><loc>https://apify.com/alice/one</loc><loc>https://apify.com/bob/two</loc></urlset>",
        ),
      );

    const result = await syncStoreSearchCatalog(
      { searchStorePage } as unknown as ApifyClientWrapper,
      {
        completeCatalog: true,
        reconcileBuilders: true,
        database: database as never,
        fetchImpl: fetchImpl as never,
      },
    );

    expect(result).toMatchObject({ expectedCount: 2, processedCount: 2, createdCount: 2 });
    expect(database.storeActor.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ apifyActorId: "alice/one", username: "alice" }),
          expect.objectContaining({ apifyActorId: "bob/two", username: "bob" }),
        ]),
      }),
    );
  });

  it("does not fetch the sitemap during the normal daily Store crawl", async () => {
    const database = databaseMock();
    database.storeActor.findMany.mockResolvedValue([]);
    const searchStorePage = vi.fn().mockResolvedValue({
      items: [{ id: "actor-1", username: "alice", name: "one", title: "One", stats: null }],
      totalResults: 1,
    });
    const fetchImpl = vi.fn();

    const result = await syncStoreSearchCatalog({ searchStorePage } as unknown as ApifyClientWrapper, {
      completeCatalog: true,
      reconcileBuilders: false,
      database: database as never,
      fetchImpl: fetchImpl as never,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ expectedCount: 1, processedCount: 1, createdCount: 1 });
  });

  it("does not mark a truncated full catalog page traversal as complete", async () => {
    const database = databaseMock();
    database.storeActor.findMany.mockResolvedValue([]);
    database.storeActor.count.mockResolvedValueOnce(2);
    database.storeActorSnapshot.count.mockResolvedValueOnce(1);
    const searchStorePage = vi.fn().mockResolvedValue({
      items: [{ id: "actor-1", username: "alice", name: "one", title: "One", stats: null }],
      totalResults: 2,
    });

    const result = await syncStoreSearchCatalog(
      { searchStorePage } as unknown as ApifyClientWrapper,
      { completeCatalog: true, reconcileBuilders: false, database: database as never },
    );

    expect(result).toMatchObject({ expectedCount: 2, processedCount: 1 });
    expect(database.storeCatalogSync.create).toHaveBeenCalledWith({
      data: { operation: "SEARCH_FULL", status: "RUNNING" },
    });
    expect(database.storeCatalogSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PARTIAL",
          error: "Persisted metrics for 1 of 2 current Store Actors",
        }),
      }),
    );
  });

  it("completes a full crawl when every current Store Actor has a daily snapshot", async () => {
    const database = databaseMock();
    database.storeActor.findMany.mockResolvedValue([]);
    database.storeActor.count.mockResolvedValueOnce(1);
    database.storeActorSnapshot.count.mockResolvedValueOnce(1);
    const searchStorePage = vi.fn().mockResolvedValue({
      items: [{ id: "actor-1", username: "alice", name: "one", title: "One", stats: null }],
      totalResults: 2,
    });

    await syncStoreSearchCatalog(
      { searchStorePage } as unknown as ApifyClientWrapper,
      { completeCatalog: true, reconcileBuilders: false, database: database as never },
    );

    expect(database.storeCatalogSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED", expectedCount: 1 }),
      }),
    );
  });

  it("persists bounded live progress while a full catalog crawl is running", async () => {
    const database = databaseMock();
    database.storeActor.findMany.mockResolvedValue([]);
    const searchStorePage = vi.fn().mockResolvedValue({
      items: [{ id: "actor-1", username: "alice", name: "one", title: "One", stats: null }],
      totalResults: 1,
    });

    await syncStoreSearchCatalog(
      { searchStorePage } as unknown as ApifyClientWrapper,
      { completeCatalog: true, reconcileBuilders: false, database: database as never },
    );

    expect(database.storeCatalogSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sync-1" },
        data: expect.objectContaining({
          status: "RUNNING",
          expectedCount: 1,
          processedCount: 1,
          createdCount: 1,
        }),
      }),
    );
  });

  it("reconciles every Actor for a sitemap builder and snapshots Store metrics", async () => {
    const database = databaseMock();
    database.storeActor.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "row-1", apifyActorId: "actor-1", username: "crawlerbros", actorName: "one" },
        { id: "row-2", apifyActorId: "actor-2", username: "crawlerbros", actorName: "two" },
      ])
      .mockResolvedValueOnce([
        { id: "row-1", apifyActorId: "actor-1", username: "crawlerbros", actorName: "one" },
        { id: "row-2", apifyActorId: "actor-2", username: "crawlerbros", actorName: "two" },
      ]);
    const searchStorePage = vi.fn().mockImplementation(async (options: { q?: string }) =>
      options.q === "crawlerbros"
        ? {
            items: [
              {
                id: "actor-1",
                username: "crawlerbros",
                name: "one",
                title: "One",
                stats: { totalUsers30Days: 11, publicActorRunStats30Days: { TOTAL: 21 } },
              },
              {
                id: "actor-2",
                username: "crawlerbros",
                name: "two",
                title: "Two",
                stats: { totalUsers30Days: 12, publicActorRunStats30Days: { TOTAL: 22 } },
              },
            ],
            totalResults: 2,
          }
        : { items: [], totalResults: 2 },
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          "<sitemapindex><loc>https://apify.com/sitemap/actors1.xml</loc></sitemapindex>",
        ),
      )
      .mockResolvedValueOnce(
        new Response("<urlset><loc>https://apify.com/crawlerbros/one</loc></urlset>"),
      );

    const result = await syncStoreSearchCatalog(
      { searchStorePage } as unknown as ApifyClientWrapper,
      {
        completeCatalog: true,
        reconcileBuilders: true,
        database: database as never,
        fetchImpl: fetchImpl as never,
        builderBatchDelayMs: 0,
      },
    );

    expect(result).toMatchObject({ processedCount: 2, createdCount: 2 });
    expect(searchStorePage).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "crawlerbros",
        searchBackend: "public",
        includeUnrunnableActors: true,
      }),
    );
    expect(database.storeActorSnapshot.upsert).toHaveBeenCalledTimes(2);
    expect(database.storeActorSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ users30Days: 11, runs30Days: 21 }),
      }),
    );
  });

  it("paginates beyond 1,000 targeted builder results and excludes other owners", async () => {
    const database = databaseMock();
    database.storeActor.findMany.mockResolvedValue([]);
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      id: `crawler-${index}`,
      username: "crawlerbros",
      name: `actor-${index}`,
      title: `Actor ${index}`,
      stats: null,
    }));
    const searchStorePage = vi
      .fn()
      .mockImplementation(async (options: { q?: string; offset?: number }) =>
        options.q === "crawlerbros"
          ? options.offset === 0
            ? { items: firstPage, totalResults: 1_002 }
            : {
                items: [
                  {
                    id: "crawler-1000",
                    username: "crawlerbros",
                    name: "actor-1000",
                    title: "Actor 1000",
                    stats: null,
                  },
                  {
                    id: "foreign-result",
                    username: "crawlerbrothers",
                    name: "unrelated",
                    title: "Unrelated",
                    stats: null,
                  },
                ],
                totalResults: 1_002,
              }
          : { items: [], totalResults: 1_002 },
      );
    const result = await syncStoreSearchCatalog(
      { searchStorePage } as unknown as ApifyClientWrapper,
      {
        completeCatalog: true,
        builderUsername: "crawlerbros",
        reconcileBuilders: false,
        database: database as never,
        builderBatchDelayMs: 0,
      },
    );

    expect(searchStorePage).toHaveBeenCalledWith(
      expect.objectContaining({ q: "crawlerbros", offset: 1_000, limit: 1_000 }),
    );
    // The similar owner name returned by public Store search must not enter
    // the selected builder's daily snapshot.
    expect(result.processedCount).toBe(1_001);
  });
});
