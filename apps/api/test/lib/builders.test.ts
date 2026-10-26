import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  snapshots: { findMany: vi.fn() },
  sync: { findFirst: vi.fn(), findMany: vi.fn() },
  publicActor: vi.fn(),
  earnings: vi.fn(),
}));
vi.mock("@actorconsole/db", async () => {
  const { Prisma } = await import("@prisma/client");
  return {
    Prisma,
    db: {
      storeActor: mocks.actor,
      storeActorSnapshot: mocks.snapshots,
      storeCatalogSync: mocks.sync,
    },
  };
});
vi.mock("@actorconsole/apify", () => ({ getPublicActor: mocks.publicActor }));
vi.mock("../../src/lib/public-actor-content.js", () => ({ getPublicActorStoreRating: vi.fn() }));
vi.mock("../../src/lib/builder-earnings.js", () => ({ getBuilderEarnings: mocks.earnings }));
vi.mock("../../src/lib/public-cache.js", () => ({ publicCache: (load: unknown) => load }));

import {
  getBuilderActorDetail,
  getBuilderComparisonHistory,
  getBuilderProfile,
  getBuildersForComparison,
  newlyPublishedWhere,
} from "../../src/lib/builders.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  mocks.earnings.mockResolvedValue({ builders: {} });
  mocks.sync.findMany.mockResolvedValue([]);
  mocks.actor.groupBy.mockImplementation(async (query) =>
    query._sum
      ? [
          {
            username: "alice",
            _count: { _all: 1, firstPublishedAt: 1, runs30Days: 1 },
            _sum: {
              users7Days: 50,
              users30Days: 100,
              users90Days: 150,
              totalUsers: 200,
              runs30Days: 300,
              totalRuns: 400,
            },
            _max: { lastSeenAt: new Date("2026-10-25") },
          },
        ]
      : [],
  );
  mocks.actor.count.mockResolvedValue(1);
  mocks.actor.findFirst.mockResolvedValue({ ownerName: "Alice", ownerPictureUrl: null });
  mocks.actor.findMany.mockImplementation(async ({ select }) => {
    if (select.lastSeenAt && !select.title)
      return [
        {
          id: "old",
          username: "alice",
          firstSeenAt: new Date("2026-08-08"),
          lastSeenAt: new Date("2026-10-05"),
        },
      ];
    return [];
  });
  mocks.snapshots.findMany.mockResolvedValue([
    {
      storeActorId: "old",
      capturedAt: new Date("2026-10-04"),
      users30Days: 30,
      runs30Days: 100,
      storeActor: { username: "alice" },
    },
    {
      storeActorId: "old",
      capturedAt: new Date("2026-10-05"),
      users30Days: 39,
      runs30Days: 110,
      storeActor: { username: "alice" },
    },
  ]);
  mocks.sync.findFirst.mockResolvedValue({ completedAt: new Date("2026-10-26T01:00:00Z") });
});
afterEach(() => vi.useRealTimers());

describe("builder catalog availability and history", () => {
  it("never treats upload or discovery timestamps as publication dates", async () => {
    expect(newlyPublishedWhere(new Date("2026-09-27"))).toEqual({
      firstPublishedAt: { gte: new Date("2026-09-27") },
    });
    mocks.actor.groupBy.mockImplementation(async (query) =>
      query._sum
        ? [
            {
              username: "alice",
              _count: { _all: 1, firstPublishedAt: 0, runs30Days: 0 },
              _sum: {},
              _max: { lastSeenAt: new Date("2026-10-26") },
            },
          ]
        : [],
    );
    mocks.actor.findMany.mockImplementation(async ({ select }) => {
      if (select.lastSeenAt && !select.title)
        return [
          {
            id: "old",
            firstSeenAt: new Date("2026-10-08"),
            lastSeenAt: new Date("2026-10-26"),
            firstPublishedAt: null,
          },
        ];
      if (select.firstPublishedAt && !select.title)
        return [
          {
            firstPublishedAt: null,
            apifyCreatedAt: new Date("2026-09-30"),
            firstSeenAt: new Date("2026-10-08"),
          },
        ];
      return [];
    });
    const profile = await getBuilderProfile("alice");
    expect(profile?.newActorCount).toBeNull();
    expect(profile?.ranks["new-actors"]).toBe(0);
    expect(profile?.publicationDateCoverage).toEqual({ known: 0, total: 1 });
    expect(profile?.publishingChart.reduce((sum, point) => sum + point.actors, 0)).toBe(0);
  });

  it("shows partial run history with coverage and suppresses full-portfolio growth", async () => {
    mocks.actor.findMany.mockImplementation(async ({ select }) =>
      select.lastSeenAt && !select.title
        ? ["known", "missing"].map((id) => ({
            id,
            firstSeenAt: new Date("2026-08-08"),
            lastSeenAt: new Date("2026-10-26"),
          }))
        : [],
    );
    mocks.snapshots.findMany.mockResolvedValue([
      {
        storeActorId: "known",
        capturedAt: new Date("2026-10-25"),
        users30Days: 10,
        runs30Days: 100,
      },
      {
        storeActorId: "missing",
        capturedAt: new Date("2026-10-25"),
        users30Days: 0,
        runs30Days: null,
      },
      {
        storeActorId: "known",
        capturedAt: new Date("2026-10-26"),
        users30Days: 10,
        runs30Days: 110,
      },
      {
        storeActorId: "missing",
        capturedAt: new Date("2026-10-26"),
        users30Days: 0,
        runs30Days: null,
      },
    ]);
    const profile = await getBuilderProfile("alice");
    expect(profile?.trendChart.at(-1)).toMatchObject({
      runs: 110,
      runsCoverage: { known: 1, total: 2 },
    });
    expect(profile?.changes.runs).toBeNull();
  });

  it("uses Store observation time and current aggregates rather than retired Actor history for headline metrics", async () => {
    const profile = await getBuilderProfile("alice", { window: 30 });
    expect(profile).toMatchObject({
      isAvailable: true,
      activeUsers: 100,
      recentRuns: 300,
      lastUpdatedAt: new Date("2026-10-25"),
      changes: { users: null, runs: null },
    });
    expect(profile?.trendChart.find((point) => point.date === "2026-10-05")).toMatchObject({
      observed: true,
      users: 39,
    });
    expect(mocks.actor.groupBy.mock.calls[0][0]._max).toEqual({ lastSeenAt: true });
  });

  it("reports growth when the latest complete snapshot matches the current portfolio", async () => {
    mocks.actor.findMany.mockImplementation(async ({ select }) =>
      select.lastSeenAt && !select.title
        ? [
            {
              id: "old",
              firstSeenAt: new Date("2026-08-08"),
              lastSeenAt: new Date("2026-10-25"),
            },
          ]
        : [],
    );
    mocks.snapshots.findMany.mockResolvedValue([
      { storeActorId: "old", capturedAt: new Date("2026-10-24"), users30Days: 30, runs30Days: 100 },
      {
        storeActorId: "old",
        capturedAt: new Date("2026-10-25"),
        users30Days: 100,
        runs30Days: 300,
      },
    ]);
    expect((await getBuilderProfile("alice"))?.changes).toEqual({ users: 70, runs: 200 });
  });

  it.each([7, 90] as const)(
    "never attaches a 30-day user delta to a %s-day user total",
    async (window) => {
      const profile = await getBuilderProfile("alice", { window });
      expect(profile?.changes.users).toBeNull();
      expect(profile?.activeUsers).toBe(window === 7 ? 50 : 150);
    },
  );

  it("preserves an entirely retired builder's history without adding it to comparison rankings", async () => {
    mocks.actor.groupBy.mockResolvedValue([]);
    mocks.actor.count.mockResolvedValue(0);
    const profile = await getBuilderProfile("alice");
    expect(profile).toMatchObject({ isAvailable: false, actorCount: 0 });
    expect(profile?.trendChart.find((point) => point.date === "2026-10-05")).toMatchObject({
      observed: true,
      users: 39,
    });
    expect(await getBuildersForComparison(["alice"])).toEqual([]);
  });

  it("keeps the same archived history in comparison charts", async () => {
    const histories = await getBuilderComparisonHistory(["alice"], 30);
    expect(histories.get("alice")?.find((point) => point.date === "2026-10-05")).toMatchObject({
      observed: true,
      users: 39,
    });
    expect(mocks.actor.findMany.mock.calls[0][0].where).not.toHaveProperty("isPublic");
  });

  it("renders a retired Actor from recorded data without claiming a successful failed refresh or fetching live documentation", async () => {
    mocks.actor.findFirst.mockResolvedValue({
      id: "old",
      apifyActorId: "immutable-old",
      username: "alice",
      actorName: "old",
      isPublic: false,
      isDeprecated: false,
      title: "Old",
      websiteIdentity: null,
      pricingInfos: [],
      snapshots: [],
      firstSeenAt: new Date("2026-08-08"),
      lastSeenAt: new Date("2026-10-05"),
      detailsSyncedAt: new Date("2026-10-26"),
      detailsSyncError: "Actor was not found",
    });
    const actor = await getBuilderActorDetail("alice", "old");
    expect(actor).toMatchObject({ isAvailable: false, detailsSyncedAt: null });
    expect(actor?.earnings).toBeUndefined();
    expect(mocks.publicActor).not.toHaveBeenCalled();
    expect(actor?.trend.at(-1)).toMatchObject({ observed: false });
  });
});
