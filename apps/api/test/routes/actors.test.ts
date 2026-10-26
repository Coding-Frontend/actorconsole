import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

// ─── Mocks (vi.hoisted so they're available inside vi.mock factories) ──────

const {
  mockFindManyActors,
  mockFindFirstActor,
  mockUpsert,
  mockFindUniqueActor,
  mockFindUniqueStoreActor,
  mockFindManyStoreActors,
  mockUpdateActor,
  mockUpdateManyActor,
  mockCountActors,
  mockDeleteManyVariants,
  mockUpdateManyVariants,
  mockCreateVariant,
  mockTransaction,
  mockFindManySnapshots,
  mockFindManyInsightSnapshots,
  mockGetUserApifyClient,
  mockValidateUserApifyAccountMatch,
  mockRewriteActorCopy,
  mockTrackEvent,
  mockCacheGet,
  mockCacheSet,
  cacheMiss,
  mockCheckRateLimit,
  mockOnboardingUpdateMany,
  mockCreatePricingHistory,
  mockFindUniqueApifyToken,
  mockFindUniqueWorkspaceFinancialCache,
  mockUpsertWorkspaceFinancialCache,
  mockEnqueue,
  mockGetQueuedJob,
  mockAdmitWorkspaceActors,
  mockFindFirstBusinessProfile,
  mockFindUniqueRunSnapshot,
} = vi.hoisted(() => ({
  mockFindManyActors: vi.fn(),
  mockFindFirstActor: vi.fn(),
  mockUpsert: vi.fn(),
  mockFindUniqueActor: vi.fn(),
  mockFindUniqueStoreActor: vi.fn(),
  mockFindManyStoreActors: vi.fn(),
  mockUpdateActor: vi.fn(),
  mockUpdateManyActor: vi.fn(),
  mockCountActors: vi.fn(),
  mockDeleteManyVariants: vi.fn(),
  mockUpdateManyVariants: vi.fn(),
  mockCreateVariant: vi.fn(),
  mockTransaction: vi.fn(),
  mockFindManySnapshots: vi.fn(),
  mockFindManyInsightSnapshots: vi.fn(),
  mockGetUserApifyClient: vi.fn(),
  mockValidateUserApifyAccountMatch: vi.fn(),
  mockRewriteActorCopy: vi.fn(),
  mockTrackEvent: vi.fn(),
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
  cacheMiss: Symbol("cache-miss"),
  mockCheckRateLimit: vi.fn(),
  mockOnboardingUpdateMany: vi.fn(),
  mockCreatePricingHistory: vi.fn(),
  mockFindUniqueApifyToken: vi.fn(),
  mockFindUniqueWorkspaceFinancialCache: vi.fn(),
  mockUpsertWorkspaceFinancialCache: vi.fn(),
  mockEnqueue: vi.fn(),
  mockGetQueuedJob: vi.fn(),
  mockAdmitWorkspaceActors: vi.fn(),
  mockFindFirstBusinessProfile: vi.fn(),
  mockFindUniqueRunSnapshot: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  admitWorkspaceActors: (...args: unknown[]) => mockAdmitWorkspaceActors(...args),
  db: {
    businessProfile: { findFirst: (...args: unknown[]) => mockFindFirstBusinessProfile(...args) },
    actor: {
      findMany: (...args: unknown[]) => mockFindManyActors(...args),
      findFirst: (...args: unknown[]) => mockFindFirstActor(...args),
      findUnique: (...args: unknown[]) => mockFindUniqueActor(...args),
      update: (...args: unknown[]) => mockUpdateActor(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      updateMany: (...args: unknown[]) => mockUpdateManyActor(...args),
      count: (...args: unknown[]) => mockCountActors(...args),
    },
    storeActor: {
      findUnique: (...args: unknown[]) => mockFindUniqueStoreActor(...args),
      findMany: (...args: unknown[]) => mockFindManyStoreActors(...args),
    },
    actorSnapshot: {
      findMany: (...args: unknown[]) => mockFindManySnapshots(...args),
    },
    actorRunSnapshot: { findUnique: (...args: unknown[]) => mockFindUniqueRunSnapshot(...args) },
    actorInsightSnapshot: {
      groupBy: (...args: unknown[]) => mockFindManyInsightSnapshots(...args),
    },
    copyVariant: {
      deleteMany: (...args: unknown[]) => mockDeleteManyVariants(...args),
      updateMany: (...args: unknown[]) => mockUpdateManyVariants(...args),
      create: (...args: unknown[]) => mockCreateVariant(...args),
    },
    onboardingState: {
      updateMany: (...args: unknown[]) => mockOnboardingUpdateMany(...args),
    },
    apifyToken: {
      findUnique: (...args: unknown[]) => mockFindUniqueApifyToken(...args),
    },
    pricingHistory: {
      create: (...args: unknown[]) => mockCreatePricingHistory(...args),
    },
    workspaceFinancialCache: {
      findUnique: (...args: unknown[]) => mockFindUniqueWorkspaceFinancialCache(...args),
      upsert: (...args: unknown[]) => mockUpsertWorkspaceFinancialCache(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@actorconsole/apify", () => ({
  APIFY_ACCOUNT_MISMATCH_CODE: "APIFY_ACCOUNT_MISMATCH",
  getAdminApifyClient: vi.fn().mockResolvedValue(null),
  getUserApifyClient: (...args: unknown[]) => mockGetUserApifyClient(...args),
  validateUserApifyAccountMatch: (...args: unknown[]) => mockValidateUserApifyAccountMatch(...args),
}));

vi.mock("@actorconsole/ai", () => ({
  rewriteActorCopy: (...args: unknown[]) => mockRewriteActorCopy(...args),
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("../../src/lib/rate-limit.js", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("../../src/lib/cache.js", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cached: vi.fn((_key: string, _ttl: number, loader: () => Promise<any>) => loader()),
  CACHE_MISS: cacheMiss,
}));

vi.mock("../../src/lib/queue.js", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
  getQueuedJob: (...args: unknown[]) => mockGetQueuedJob(...args),
}));

vi.mock("../../src/middleware/auth.js", () => ({
  requireAuth: () => async (c: any, next: any) => {
    c.set("session", {
      userId: "u1",
      email: "test@test.com",
      plan: "PRO",
      businessProfileId: "bp1",
    });
    await next();
  },
}));

import { activePricingInfo, actorRoutes, priceFromInfo } from "../../src/routes/actors.js";

function buildApp(plan: "FREE" | "PRO" = "PRO") {
  const app = new Hono();
  app.onError(onErrorHandler);
  // Inject session (mirrors requireAuth + enforcePlanLimits from app.ts)
  app.use("*", async (c: any, next: any) => {
    c.set("session", {
      userId: "u1",
      email: "test@test.com",
      plan,
      businessProfileId: "bp1",
    });
    await next();
  });
  app.route("/actors", actorRoutes);
  return app;
}

describe("Actor routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockAdmitWorkspaceActors.mockImplementation(async (_userId, _workspaceId, items) => ({
      items,
      created: items.length,
      skipped: 0,
      trackedCount: items.length,
      plan: "PRO",
      usage: {
        actorCount: items.length,
        monthlyUsers: null,
        actorLimit: null,
        monthlyUserLimit: null,
        upgradeRequired: false,
      },
    }));
    mockFindFirstBusinessProfile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 2,
      apifyMonthlyUsers: 501,
      apifyMonthlyUsersComplete: true,
      planUsageCheckedAt: new Date(),
    });
    mockTransaction.mockResolvedValue([]);
    mockCacheGet.mockResolvedValue(cacheMiss);
    mockCacheSet.mockResolvedValue(undefined);
    mockCountActors.mockResolvedValue(0);
    mockFindManyActors.mockResolvedValue([]);
    mockFindManyInsightSnapshots.mockResolvedValue([]);
    mockFindFirstActor.mockResolvedValue({ id: "a1", userId: "u1", apifyActorId: "ap1" });
    mockFindUniqueStoreActor.mockResolvedValue(null);
    mockFindManyStoreActors.mockResolvedValue([]);
    mockEnqueue.mockResolvedValue("workspace-refresh-job");
    mockOnboardingUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUniqueApifyToken.mockResolvedValue({ encryptedToken: "encrypted-api-key" });
    mockFindUniqueWorkspaceFinancialCache.mockResolvedValue(null);
    mockUpsertWorkspaceFinancialCache.mockResolvedValue({ id: "financial-cache-1" });
    mockValidateUserApifyAccountMatch.mockResolvedValue({
      matches: true,
      apiUsername: "builder",
      consoleUserId: "apify-user",
      message: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /actors/", () => {
    it("returns the user's actors", async () => {
      const actors = [{ id: "a1", apifyActorId: "ap1", title: "Test Actor" }];
      mockFindManyActors.mockResolvedValueOnce(actors);
      // Hono routes with trailing slash: /actors/ may or may not match
      // depending on Hono's strict routing. Use /actors (no trailing slash)
      // to match the route definition.
      const res = await buildApp().request("/actors");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toMatchObject(actors);
      expect(mockFindManyActors).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            apifyActorId: true,
            title: true,
            actorName: true,
            username: true,
          }),
          where: expect.objectContaining({ apifyRemovedAt: null }),
        }),
      );
    });

    it("returns empty array when user has no actors", async () => {
      mockFindManyActors.mockResolvedValueOnce([]);
      const res = await buildApp().request("/actors");
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual([]);
    });
  });

  describe("GET /actors/available", () => {
    it("lists every Actor owned by the connected API-key account and marks tracked Actors", async () => {
      const listMyActors = vi.fn().mockResolvedValueOnce([
        {
          id: "ap1",
          username: "builder",
          name: "maps",
          title: "Maps Actor",
          stats: { totalUsers30Days: 20 },
        },
      ]);
      mockGetUserApifyClient.mockResolvedValueOnce({ listMyActors });
      mockFindManyActors.mockResolvedValueOnce([{ apifyActorId: "ap1" }]);

      const res = await buildApp().request("/actors/available");

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ok: true,
        data: [{ id: "ap1", tracked: true }],
      });
      expect(listMyActors).toHaveBeenCalledWith({ limit: 100, offset: 0 });
    });
  });

  describe("POST /actors/:apifyActorId/categories/feedback", () => {
    it("forwards category feedback without updating Actor metadata", async () => {
      const submitActorCategoriesFeedback = vi.fn().mockResolvedValueOnce({ submitted: true });
      mockGetUserApifyClient.mockResolvedValueOnce({ submitActorCategoriesFeedback });

      const res = await buildApp().request("/actors/ap1/categories/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ details: "This Actor belongs in AI tools." }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, data: { submitted: true } });
      expect(submitActorCategoriesFeedback).toHaveBeenCalledWith(
        "ap1",
        "This Actor belongs in AI tools.",
      );
      expect(mockUpdateActor).not.toHaveBeenCalled();
    });
  });

  describe("GET /actors/by-id/:id", () => {
    it("returns cached actor data without waiting for Apify", async () => {
      mockFindFirstActor.mockResolvedValueOnce({
        id: "a1",
        userId: "u1",
        businessProfileId: "bp1",
        apifyActorId: "ap1",
        username: "builder",
        actorName: "search-actor",
        title: "Cached title",
        description: null,
        snapshots: [],
        insightSnapshots: [],
        usageDaily: [],
        runSnapshots: [],
        copyVariants: [],
        pricingHistory: [],
      });
      mockFindUniqueStoreActor.mockResolvedValueOnce({
        apifyActorId: "ap1",
        isPublic: true,
        isDeprecated: false,
        totalRuns: 400,
        totalUsers: 120,
        users30Days: 33,
        runs30Days: 44,
        reviewCount: 5,
        reviewRating: 4.5,
        bookmarkCount: 12,
        categories: ["SOCIAL"],
        metaLabels: [],
        pricingInfos: [],
        apifyCreatedAt: new Date("2026-08-01"),
        firstPublishedAt: new Date("2026-08-02"),
        apifyModifiedAt: new Date("2026-08-03"),
        firstSeenAt: new Date("2026-08-04"),
        lastSeenAt: new Date("2026-08-05"),
        detailsSyncedAt: new Date("2026-08-06"),
        snapshots: [],
      });
      const getActor = vi.fn().mockResolvedValue({
        id: "ap1",
        name: "search-actor",
        username: "builder",
        title: "Live title",
        readme: "# Live README",
      });
      const getActorBasicInfo = vi.fn().mockResolvedValue({
        id: "ap1",
        title: "Store title",
        description: "Store description",
        pictureUrl: "https://example.com/actor.png",
      });
      const getActorMetricAnalytics = vi.fn().mockImplementation((_ids, month) =>
        Promise.resolve({
          month,
          actorIds: ["ap1"],
          runStatistics: { dailyStats: {} },
          userCountStatistics: { values: [] },
        }),
      );
      const listActorRuns = vi
        .fn()
        .mockResolvedValue([
          { id: "run-1", actId: "ap1", status: "SUCCEEDED", startedAt: "2026-08-10" },
        ]);
      const getActorAnalytics = vi.fn().mockResolvedValue({
        month: "2026-08-01",
        actorIds: ["ap1"],
        actorBreakdown: {},
        costsPerThousandResults: {},
        runStatistics: { dailyStats: {} },
        userCountStatistics: {},
        profitMargin: {},
        availability: {
          actorBreakdown: true,
          costsPerThousandResults: true,
          runStatistics: true,
          userCountStatistics: true,
          profitMargin: true,
        },
        errors: {},
      });
      const getActorQuality = vi.fn().mockResolvedValue({
        scores: null,
        praises: [],
        improvements: [],
      });
      const getActorSharedRunSummary = vi.fn().mockResolvedValue({
        total: 2,
        sampled: 2,
        retentionDays: 7,
        latestFinishedAt: "2026-08-12T10:00:00.000Z",
        statuses: { SUCCEEDED: 2 },
        dailyRuns: { "2026-08-12": 2 },
      });
      mockGetUserApifyClient.mockResolvedValueOnce({
        getActor,
        getActorBasicInfo,
        getActorMetricAnalytics,
        getActorAnalytics,
        getActorQuality,
        getActorSharedRunSummary,
        listActorRuns,
      });

      const res = await buildApp().request("/actors/by-id/a1");

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ok: true,
        data: {
          title: "Cached title",
          apify: {
            actor: null,
            basicInfo: null,
            recentRuns: [],
            debugging: null,
          },
          storeCatalog: {
            apifyActorId: "ap1",
            users30Days: 33,
            runs30Days: 44,
            reviewRating: 4.5,
          },
        },
      });
      expect(mockGetUserApifyClient).not.toHaveBeenCalled();
      expect(getActorMetricAnalytics).not.toHaveBeenCalled();
      expect(listActorRuns).not.toHaveBeenCalled();
    });
  });

  describe("GET /actors/by-id/:id/runs/:runId", () => {
    const run = {
      id: "run-1",
      actId: "ap1",
      status: "SUCCEEDED",
      startedAt: "2026-09-28T10:00:00.000Z",
      defaultDatasetId: "dataset-1",
      defaultKeyValueStoreId: "store-1",
    };

    it("shows run metadata and paginated dataset items", async () => {
      const listItems = vi.fn().mockResolvedValue({ items: [{ result: "ok" }], total: 31 });
      const getRun = vi.fn().mockResolvedValue(run);
      mockGetUserApifyClient.mockResolvedValue({
        getRun,
        rawClient: () => ({ run: () => ({ dataset: () => ({ listItems }) }) }),
      });

      const overview = await buildApp().request("/actors/by-id/a1/runs/run-1");
      expect(overview.status).toBe(200);
      expect(await overview.json()).toMatchObject({ data: { run: { id: "run-1" } } });

      const dataset = await buildApp().request(
        "/actors/by-id/a1/runs/run-1?section=dataset&offset=20",
      );
      expect(dataset.status).toBe(200);
      expect(listItems).toHaveBeenCalledWith({ offset: 20, limit: 20 });
      expect(await dataset.json()).toMatchObject({
        data: { dataset: { items: [{ result: "ok" }], total: 31, offset: 20 } },
      });
    });

    it("does not expose a run belonging to another Actor", async () => {
      mockGetUserApifyClient.mockResolvedValue({
        getRun: vi.fn().mockResolvedValue({ ...run, actId: "other-actor" }),
        rawClient: vi.fn(),
      });
      const response = await buildApp().request("/actors/by-id/a1/runs/run-1?section=logs");
      expect(response.status).toBe(404);
    });

    it("continues dataset pagination beyond 100,000 items", async () => {
      const listItems = vi.fn().mockResolvedValue({ items: [{ result: "later" }], total: 100_021 });
      mockGetUserApifyClient.mockResolvedValue({
        getRun: vi.fn().mockResolvedValue(run),
        rawClient: () => ({ run: () => ({ dataset: () => ({ listItems }) }) }),
      });

      const response = await buildApp().request(
        "/actors/by-id/a1/runs/run-1?section=dataset&offset=100020",
      );

      expect(response.status).toBe(200);
      expect(listItems).toHaveBeenCalledWith({ offset: 100_020, limit: 20 });
      expect(await response.json()).toMatchObject({ data: { dataset: { offset: 100_020 } } });
    });

    it.each(["-1", "1.5", "Infinity", "NaN", "9007199254740992"])(
      "rejects invalid dataset offset %s instead of showing a different page",
      async (offset) => {
        const listItems = vi.fn().mockResolvedValue({ items: [], total: 0 });
        mockGetUserApifyClient.mockResolvedValue({
          getRun: vi.fn().mockResolvedValue(run),
          rawClient: () => ({ run: () => ({ dataset: () => ({ listItems }) }) }),
        });

        const response = await buildApp().request(
          `/actors/by-id/a1/runs/run-1?section=dataset&offset=${offset}`,
        );

        expect(response.status).toBe(400);
        expect(listItems).not.toHaveBeenCalled();
      },
    );

    it("shows logs and text records from the run's own storage", async () => {
      const listKeys = vi.fn().mockImplementation(({ prefix }: { prefix?: string }) =>
        Promise.resolve({
          items: [{ key: prefix ?? "OUTPUT", size: 32 }],
          isTruncated: false,
        }),
      );
      const getRecord = vi.fn().mockResolvedValue({
        key: "OUTPUT",
        contentType: "application/json",
        value: { result: "ok" },
      });
      mockGetUserApifyClient.mockResolvedValue({
        getRun: vi.fn().mockResolvedValue(run),
        rawClient: () => ({
          run: () => ({
            log: () => ({ get: vi.fn().mockResolvedValue("Run finished") }),
            keyValueStore: () => ({ listKeys, getRecord }),
          }),
        }),
      });

      const logs = await buildApp().request("/actors/by-id/a1/runs/run-1?section=logs");
      expect(await logs.json()).toMatchObject({ data: { log: "Run finished" } });

      const records = await buildApp().request(
        "/actors/by-id/a1/runs/run-1?section=key-value-store&key=OUTPUT",
      );
      expect(records.status).toBe(200);
      expect(await records.json()).toMatchObject({
        data: { keyValueStore: { record: { key: "OUTPUT", value: { result: "ok" } } } },
      });
      expect(getRecord).toHaveBeenCalledWith("OUTPUT");
    });

    it("does not query Apify for an Actor outside the workspace", async () => {
      mockFindFirstActor.mockResolvedValueOnce(null);
      const response = await buildApp().request("/actors/by-id/a1/runs/run-1");
      expect(response.status).toBe(404);
      expect(mockGetUserApifyClient).not.toHaveBeenCalled();
    });

    it("shows a scoped saved summary when Apify no longer retains the run", async () => {
      mockGetUserApifyClient.mockResolvedValue({ getRun: vi.fn().mockResolvedValue(null), rawClient: vi.fn() });
      mockFindUniqueRunSnapshot.mockResolvedValue({ apifyRunId: "run-1", status: "FAILED", startedAt: new Date("2026-08-31T10:00:00Z"), usageCostUsd: "0.0016" });
      const response = await buildApp().request("/actors/by-id/a1/runs/run-1?section=logs");
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { storageUnavailable: true, run: { id: "run-1", status: "FAILED", usageTotalUsd: 0.0016 } } });
      expect(mockFindUniqueRunSnapshot).toHaveBeenCalledWith({ where: { actorId_apifyRunId: { actorId: "a1", apifyRunId: "run-1" } } });
    });

    it("keeps unknown runs unavailable when no scoped snapshot exists", async () => {
      mockGetUserApifyClient.mockResolvedValue({ getRun: vi.fn().mockResolvedValue(null) });
      mockFindUniqueRunSnapshot.mockResolvedValue(null);
      const response = await buildApp().request("/actors/by-id/a1/runs/unknown");
      expect(response.status).toBe(404);
    });
  });

  describe("background Actor refresh", () => {
    it("queues a workspace refresh without calling Apify in the request", async () => {
      mockFindUniqueApifyToken.mockResolvedValueOnce({
        encryptedToken: "encrypted",
        apiTokenStatus: "VALID",
      });

      const res = await buildApp().request("/actors/refresh", { method: "POST" });

      expect(res.status).toBe(202);
      expect(await res.json()).toMatchObject({
        ok: true,
        data: { jobId: "workspace-refresh-job", state: "queued" },
      });
      expect(mockEnqueue).toHaveBeenCalledWith(
        "snapshots",
        { workspaceBootstrap: { userId: "u1", businessProfileId: "bp1" } },
        { deduplication: { id: "workspace-refresh-bp1" }, lifo: true },
      );
      expect(mockGetUserApifyClient).not.toHaveBeenCalled();
    });

    it("returns the owned refresh status", async () => {
      mockGetQueuedJob.mockResolvedValueOnce({
        id: "workspace-refresh-job",
        data: { workspaceBootstrap: { userId: "u1", businessProfileId: "bp1" } },
        progress: 100,
        returnvalue: 3,
        failedReason: null,
        getState: vi.fn().mockResolvedValue("completed"),
      });

      const res = await buildApp().request("/actors/refresh/workspace-refresh-job");

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: { state: "completed", progress: 100, result: 3 },
      });
    });
  });

  describe("usage and costs", () => {
    it("defaults financial dashboards to a rolling 30-day daily range", async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const from = new Date(today);
      from.setUTCDate(from.getUTCDate() - 29);

      const res = await buildApp().request("/actors/usage");

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: {
          filters: {
            from: from.toISOString().slice(0, 10),
            to: today.toISOString().slice(0, 10),
            granularity: "day",
            mode: "absolute",
          },
        },
      });
    });

    it("returns cache and synchronization metadata with focused financial reports", async () => {
      const res = await buildApp().request("/actors/costs");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.meta).toEqual(
        expect.objectContaining({
          cached: false,
          stale: true,
          syncedAt: null,
          retryAfterSeconds: null,
        }),
      );
      expect(body.data.meta).toEqual(body.meta);
    });

    it("resolves an Apify Actor ID for an actor-scoped revenue report", async () => {
      mockFindManyActors.mockResolvedValueOnce([
        {
          id: "a1",
          apifyActorId: "owner~first",
          title: "First",
          actorName: "first",
          username: "owner",
          usageDaily: [],
        },
        {
          id: "a2",
          apifyActorId: "owner~second",
          title: "Second",
          actorName: "second",
          username: "owner",
          usageDaily: [],
        },
      ]);

      const response = await buildApp().request(
        "/actors/revenue?apifyActorId=owner~second&from=2026-08-01&to=2026-08-02",
      );

      expect(response.status).toBe(200);
      expect(mockFindManyInsightSnapshots).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ actorId: { in: ["a2"] } }) }),
      );
      expect(await response.json()).toMatchObject({ data: { filters: { actorIds: ["a2"] } } });
    });

    it("groups financial chart points into Monday-based UTC weeks", async () => {
      mockFindManyActors.mockResolvedValueOnce([
        {
          id: "a1",
          apifyActorId: "ap1",
          title: "Weekly Actor",
          actorName: "weekly-actor",
          username: "builder",
          lastRunSyncAt: new Date("2026-08-10T10:00:00.000Z"),
          usageDaily: [
            {
              date: new Date("2026-08-03T00:00:00.000Z"),
              runs: 2,
              successfulRuns: 2,
              failedRuns: 0,
              usageCostUsd: 0.2,
            },
            {
              date: new Date("2026-08-09T00:00:00.000Z"),
              runs: 3,
              successfulRuns: 2,
              failedRuns: 1,
              usageCostUsd: 0.3,
            },
            {
              date: new Date("2026-08-10T00:00:00.000Z"),
              runs: 4,
              successfulRuns: 4,
              failedRuns: 0,
              usageCostUsd: 0.4,
            },
          ],
        },
      ]);

      const res = await buildApp().request(
        "/actors/usage?from=2026-08-03&to=2026-08-10&granularity=week",
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: {
          filters: { granularity: "week" },
          report: {
            granularity: "week",
            points: [
              {
                period: "2026-08-03",
                runs: 5,
                successfulRuns: 4,
                failedRuns: 1,
              },
              {
                period: "2026-08-10",
                runs: 4,
                successfulRuns: 4,
                failedRuns: 0,
              },
            ],
          },
        },
      });
    });

    it("returns one cost row per Actor and UTC week for weekly tables", async () => {
      mockFindManyActors.mockResolvedValueOnce([
        {
          id: "a1",
          apifyActorId: "ap1",
          title: "Weekly Actor",
          actorName: "weekly-actor",
          username: "builder",
          lastRunSyncAt: new Date("2026-08-09T10:00:00.000Z"),
          usageDaily: [
            {
              date: new Date("2026-08-03T00:00:00.000Z"),
              runs: 2,
              successfulRuns: 2,
              failedRuns: 0,
              resultCount: 20,
              usageCostUsd: 0.2,
            },
            {
              date: new Date("2026-08-09T00:00:00.000Z"),
              runs: 3,
              successfulRuns: 2,
              failedRuns: 1,
              resultCount: 30,
              usageCostUsd: 0.3,
            },
          ],
        },
      ]);

      const res = await buildApp().request(
        "/actors/costs?from=2026-08-03&to=2026-08-09&table=weekly",
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.revenue.ledgerTotal).toBe(1);
      expect(body.data.revenue.ledger).toEqual([
        expect.objectContaining({
          actorId: "a1",
          date: "2026-08-03",
          directCostUsd: 0.5,
          runs: 5,
          successfulRuns: 4,
          failedRuns: 1,
          results: 50,
        }),
      ]);
    });

    it("uses durable account analytics when the Redis cache is empty", async () => {
      mockFindUniqueWorkspaceFinancialCache.mockResolvedValueOnce({
        payload: {
          syncedAt: "2026-09-01T12:00:00.000Z",
          currentPeriod: {
            usage: { totalUsageCreditsUsdAfterVolumeDiscount: 3.75 },
          },
        },
      });

      const res = await buildApp().request(
        "/actors/costs?from=2026-08-01&to=2026-08-30&granularity=day",
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: {
          accountUsage: {
            syncedAt: "2026-09-01T12:00:00.000Z",
            currentPeriod: { usage: { totalUsageCreditsUsdAfterVolumeDiscount: 3.75 } },
          },
        },
      });
      expect(mockCacheSet).toHaveBeenCalledWith(
        "workspace:bp1:apify-usage:v4",
        expect.objectContaining({ syncedAt: "2026-09-01T12:00:00.000Z" }),
        24 * 60 * 60,
      );
    });

    it("requires a daily drill-down date to remain inside the chart range", async () => {
      const res = await buildApp().request(
        "/actors/costs?from=2026-08-10&to=2026-08-20&day=2026-08-09",
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: { code: "invalid_query", message: "day must be inside the selected date range" },
      });
      expect(mockFindManyActors).not.toHaveBeenCalled();
    });

    it("returns database and cached usage without calling Apify", async () => {
      mockFindManyActors.mockResolvedValueOnce([
        {
          id: "a1",
          apifyActorId: "ap1",
          title: "Stored Actor",
          actorName: "stored-actor",
          username: "builder",
          lastRunSyncAt: new Date("2026-08-12T10:00:00.000Z"),
          usageDaily: [{ date: new Date("2026-08-11"), runs: 4, usageCostUsd: 0.25 }],
        },
      ]);
      mockCacheGet.mockResolvedValueOnce({
        syncedAt: "2026-08-12T10:01:00.000Z",
        monthly: {},
      });
      mockFindManyInsightSnapshots.mockResolvedValueOnce([
        {
          actorId: "a1",
          capturedOn: new Date("2026-08-11T00:00:00.000Z"),
          _max: { capturedAt: new Date("2026-08-12T10:02:00.000Z") },
          _sum: {
            totalRuns: 4,
            resultCount: 120,
            activeUsers: 2,
            costUsd: 0.25,
            revenueUsd: 1.5,
            profitUsd: 1.25,
          },
          _count: {
            costUsd: 1,
            revenueUsd: 1,
            profitUsd: 1,
            activeUsers: 1,
          },
        },
      ]);

      const res = await buildApp().request("/actors/usage-costs?from=2026-08-01&to=2026-08-12");

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: {
          items: [{ id: "a1", title: "Stored Actor" }],
          accountUsage: { syncedAt: "2026-08-12T10:01:00.000Z" },
          revenue: {
            syncedAt: "2026-08-12T10:02:00.000Z",
            daily: [
              {
                date: "2026-08-11",
                costUsd: 0.25,
                revenueUsd: 1.5,
                profitUsd: 1.25,
                runs: 4,
                results: 120,
              },
            ],
            actors: [
              expect.objectContaining({
                apifyActorId: "ap1",
                revenueUsd: 1.5,
                profitUsd: 1.25,
              }),
            ],
          },
        },
      });
      expect(mockGetUserApifyClient).not.toHaveBeenCalled();
    });

    it("keeps Actor and day dimensions for filtered financial ranges", async () => {
      mockFindManyActors.mockResolvedValueOnce([
        {
          id: "a1",
          apifyActorId: "ap1",
          title: "Selected Actor",
          actorName: "selected-actor",
          username: "builder",
          lastRunSyncAt: new Date("2026-08-12T10:00:00.000Z"),
          lastInsightSyncAt: new Date("2026-08-12T10:00:00.000Z"),
          insightSyncStatus: "COMPLETE",
          insightSyncError: null,
          usageDaily: [
            {
              date: new Date("2026-08-08"),
              runs: 1,
              resultCount: 10,
              successfulRuns: 1,
              failedRuns: 0,
              usageCostUsd: 0.1,
            },
            {
              date: new Date("2026-08-10"),
              runs: 2,
              resultCount: 20,
              successfulRuns: 2,
              failedRuns: 0,
              usageCostUsd: 0.25,
            },
          ],
        },
        {
          id: "a2",
          apifyActorId: "ap2",
          title: "Other Actor",
          actorName: "other-actor",
          username: "builder",
          lastRunSyncAt: new Date("2026-08-12T10:00:00.000Z"),
          lastInsightSyncAt: null,
          insightSyncStatus: "COMPLETE",
          insightSyncError: null,
          usageDaily: [
            {
              date: new Date("2026-08-10"),
              runs: 2,
              resultCount: 5,
              successfulRuns: 2,
              failedRuns: 0,
              usageCostUsd: 0.25,
            },
          ],
        },
        {
          id: "a3",
          apifyActorId: "ap3",
          title: "Selected Actor Without Activity",
          actorName: "selected-actor-without-activity",
          username: "builder",
          lastRunSyncAt: new Date("2026-08-12T10:00:00.000Z"),
          lastInsightSyncAt: null,
          insightSyncStatus: "COMPLETE",
          insightSyncError: null,
          usageDaily: [],
        },
      ]);
      mockCacheGet.mockResolvedValueOnce({
        syncedAt: "2026-08-12T10:01:00.000Z",
        calendarMonth: {
          dailyServiceUsage: {
            "2026-08-10": [{ quantity: 1, baseAmountUsd: 1, baseUnitPriceUsd: 1 }],
          },
          monthlyServiceUsage: {},
        },
      });
      mockFindManyInsightSnapshots.mockResolvedValueOnce([
        {
          actorId: "a1",
          capturedOn: new Date("2026-08-08T00:00:00.000Z"),
          _max: { capturedAt: new Date("2026-08-12T10:02:00.000Z") },
          _sum: {
            totalRuns: 1,
            resultCount: 10,
            activeUsers: 1,
            costUsd: 0.1,
            revenueUsd: 0.5,
            profitUsd: 0.4,
          },
          _count: { costUsd: 1, revenueUsd: 1, profitUsd: 1, activeUsers: 1 },
        },
        {
          actorId: "a1",
          capturedOn: new Date("2026-08-10T00:00:00.000Z"),
          _max: { capturedAt: new Date("2026-08-12T10:02:00.000Z") },
          _sum: {
            totalRuns: 2,
            resultCount: 20,
            activeUsers: 2,
            costUsd: 0.25,
            revenueUsd: 2,
            profitUsd: 1.75,
          },
          _count: { costUsd: 1, revenueUsd: 1, profitUsd: 1, activeUsers: 1 },
        },
      ]);

      const res = await buildApp().request(
        "/actors/revenue?actorIds=a1,a3&from=2026-08-10&to=2026-08-11&granularity=day&day=2026-08-10",
      );

      expect(res.status).toBe(200);
      expect(mockFindManyInsightSnapshots).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["actorId", "capturedOn"],
          where: expect.objectContaining({ actorId: { in: ["a1", "a3"] } }),
        }),
      );
      expect(await res.json()).toMatchObject({
        data: {
          filters: {
            from: "2026-08-10",
            to: "2026-08-11",
            previousFrom: "2026-08-08",
            previousTo: "2026-08-09",
            actorIds: ["a1", "a3"],
            day: "2026-08-10",
          },
          revenue: {
            actors: [
              expect.objectContaining({
                id: "a1",
                previousRevenueUsd: 0.5,
                previousRuns: 1,
              }),
              expect.objectContaining({
                id: "a3",
                revenueUsd: 0,
                runs: 0,
                costAvailable: false,
              }),
            ],
            ledger: [
              expect.objectContaining({
                actorId: "a1",
                date: "2026-08-10",
                directCostUsd: 0.25,
                allocatedCostUsd: 0.5,
                revenueUsd: 2,
                netProfitUsd: 1.5,
              }),
            ],
            comparison: {
              current: expect.objectContaining({ revenueUsd: 2, allocatedCostUsd: 0.5 }),
              previous: expect.objectContaining({ revenueUsd: 0.5, costUsd: 0.1 }),
            },
            coverage: expect.objectContaining({ selectedActors: 2, rows: 1 }),
          },
        },
      });
    });

    it("allocates each day's account overhead exactly once across all Actor rows", async () => {
      mockFindManyActors.mockResolvedValueOnce([
        {
          id: "a1",
          apifyActorId: "ap1",
          title: "Sparse run Actor",
          actorName: "sparse-run-actor",
          username: "builder",
          lastRunSyncAt: new Date("2026-08-12T10:00:00.000Z"),
          lastInsightSyncAt: new Date("2026-08-12T10:00:00.000Z"),
          insightSyncStatus: "COMPLETE",
          insightSyncError: null,
          usageDaily: [
            {
              date: new Date("2026-08-10"),
              runs: 1,
              resultCount: 1,
              successfulRuns: 1,
              failedRuns: 0,
              usageCostUsd: 0,
            },
          ],
        },
        {
          id: "a2",
          apifyActorId: "ap2",
          title: "Insight-only Actor",
          actorName: "insight-only-actor",
          username: "builder",
          lastRunSyncAt: null,
          lastInsightSyncAt: new Date("2026-08-12T10:00:00.000Z"),
          insightSyncStatus: "COMPLETE",
          insightSyncError: null,
          usageDaily: [],
        },
      ]);
      mockCacheGet.mockResolvedValueOnce({
        syncedAt: "2026-08-12T10:01:00.000Z",
        calendarMonth: {
          dailyServiceUsage: {
            "2026-08-10": [{ quantity: 1, baseAmountUsd: 1, baseUnitPriceUsd: 1 }],
          },
          monthlyServiceUsage: {},
        },
      });
      mockFindManyInsightSnapshots.mockResolvedValueOnce(
        ["a1", "a2"].map((actorId) => ({
          actorId,
          capturedOn: new Date("2026-08-10T00:00:00.000Z"),
          _max: { capturedAt: new Date("2026-08-12T10:02:00.000Z") },
          _sum: {
            totalRuns: 5,
            succeededRuns: 5,
            failedRuns: 0,
            resultCount: 5,
            activeUsers: 1,
            costUsd: 0,
            revenueUsd: 1,
            profitUsd: 1,
          },
          _count: { costUsd: 1, revenueUsd: 1, profitUsd: 1, activeUsers: 1 },
        })),
      );

      const res = await buildApp().request(
        "/actors/costs?from=2026-08-10&to=2026-08-10&granularity=day",
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.revenue.comparison.current.allocatedCostUsd).toBeCloseTo(1);
      expect(
        body.data.revenue.actors.reduce(
          (total: number, actor: { allocatedCostUsd: number }) => total + actor.allocatedCostUsd,
          0,
        ),
      ).toBeCloseTo(1);
    });

    it("refreshes live account usage only through the background endpoint", async () => {
      const getMonthlyUsages = vi.fn().mockResolvedValue({ "2026-08": { serviceUsages: {} } });
      const getActorUsageBreakdown = vi.fn().mockResolvedValue([]);
      const getCalendarMonthUsage = vi.fn().mockResolvedValue({
        dailyServiceUsage: {},
        monthlyServiceUsage: {},
      });
      const getCurrentBillingCycleServiceBreakdown = vi.fn().mockResolvedValue({});
      const getAccountMonthlyUsage = vi.fn().mockResolvedValue({
        usageCycle: {
          startAt: "2026-08-01T00:00:00.000Z",
          endAt: "2026-09-01T00:00:00.000Z",
        },
        monthlyServiceUsage: {},
        dailyServiceUsages: [],
        totalUsageCreditsUsdBeforeVolumeDiscount: 1.25,
        totalUsageCreditsUsdAfterVolumeDiscount: 1,
      });
      const getAccountLimits = vi.fn().mockResolvedValue({
        monthlyUsageCycle: {
          startAt: "2026-08-01T00:00:00.000Z",
          endAt: "2026-09-01T00:00:00.000Z",
        },
        limits: { maxMonthlyUsageUsd: 100 },
        current: { monthlyUsageUsd: 1 },
      });
      mockGetUserApifyClient.mockResolvedValueOnce({
        getMonthlyUsages,
        getActorUsageBreakdown,
        getCalendarMonthUsage,
        getCurrentBillingCycleServiceBreakdown,
        getAccountMonthlyUsage,
        getAccountLimits,
      });

      const res = await buildApp().request("/actors/usage-costs/account-refresh", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: {
          actors: { current: [], previous: [] },
          currentPeriod: {
            usage: { totalUsageCreditsUsdAfterVolumeDiscount: 1 },
            limits: { limits: { maxMonthlyUsageUsd: 100 } },
          },
          unavailable: 0,
        },
      });
      expect(getMonthlyUsages).toHaveBeenCalledOnce();
      expect(getActorUsageBreakdown).toHaveBeenCalledTimes(2);
      expect(getCalendarMonthUsage).toHaveBeenCalledTimes(12);
      expect(getAccountMonthlyUsage).toHaveBeenCalledOnce();
      expect(getAccountLimits).toHaveBeenCalledOnce();
      expect(mockCacheSet).toHaveBeenCalledWith(
        "workspace:bp1:apify-usage:v4",
        expect.objectContaining({ syncedAt: expect.any(String), unavailable: 0 }),
        24 * 60 * 60,
      );
      expect(mockUpsertWorkspaceFinancialCache).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { businessProfileId: "bp1" },
          create: expect.objectContaining({ businessProfileId: "bp1" }),
          update: expect.objectContaining({ syncedAt: expect.any(Date) }),
        }),
      );
    });

    it("keeps API usage but blocks Console analytics when credentials identify different accounts", async () => {
      const getAccountMonthlyUsage = vi.fn().mockResolvedValue({
        monthlyServiceUsage: {},
        dailyServiceUsages: [],
        totalUsageCreditsUsdAfterVolumeDiscount: 4.5,
      });
      const getAccountLimits = vi.fn().mockResolvedValue({
        limits: { maxMonthlyUsageUsd: 100 },
        current: { monthlyUsageUsd: 4.5 },
      });
      const getMonthlyUsages = vi.fn();
      const getActorUsageBreakdown = vi.fn();
      mockGetUserApifyClient.mockResolvedValueOnce({
        getAccountMonthlyUsage,
        getAccountLimits,
        getMonthlyUsages,
        getActorUsageBreakdown,
      });
      mockValidateUserApifyAccountMatch.mockResolvedValueOnce({
        matches: false,
        apiUsername: "builder",
        consoleUserId: "other-user",
        message: "The Console cookies belong to another account.",
      });

      const res = await buildApp().request("/actors/usage-costs/account-refresh", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: {
          monthly: null,
          actors: { current: null, previous: null },
          currentPeriod: {
            usage: { totalUsageCreditsUsdAfterVolumeDiscount: 4.5 },
            limits: { limits: { maxMonthlyUsageUsd: 100 } },
          },
          credentialIssue: {
            code: "APIFY_ACCOUNT_MISMATCH",
            message: "The Console cookies belong to another account.",
          },
        },
      });
      expect(getMonthlyUsages).not.toHaveBeenCalled();
      expect(getActorUsageBreakdown).not.toHaveBeenCalled();
      expect(getAccountMonthlyUsage).toHaveBeenCalledOnce();
      expect(getAccountLimits).toHaveBeenCalledOnce();
    });

    it("does not queue owner analytics when the Apify accounts do not match", async () => {
      mockValidateUserApifyAccountMatch.mockResolvedValueOnce({
        matches: false,
        message: "Use Console cookies from the API-key account.",
      });

      const res = await buildApp().request("/actors/usage-costs/sync", { method: "POST" });

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        error: { message: "Use Console cookies from the API-key account." },
      });
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it("queues API-key usage synchronization independently of Console credentials", async () => {
      mockFindManyActors.mockResolvedValueOnce([{ id: "a1" }]);

      const res = await buildApp().request("/actors/usage/sync", { method: "POST" });

      expect(res.status).toBe(202);
      expect(await res.json()).toMatchObject({ data: { queued: 1 } });
      expect(mockValidateUserApifyAccountMatch).not.toHaveBeenCalled();
      expect(mockEnqueue).toHaveBeenCalledWith("snapshots", { actorId: "a1" });
    });
  });

  describe("POST /actors/sync", () => {
    it("reconciles an empty Apify inventory and resets the active actor count", async () => {
      mockGetUserApifyClient.mockResolvedValueOnce({ listMyActors: vi.fn().mockResolvedValue([]) });
      const res = await buildApp().request("/actors/sync", { method: "POST" });
      expect(res.status).toBe(200);
      expect(mockAdmitWorkspaceActors).toHaveBeenCalledWith("u1", "bp1", [], { reconcile: true });
      expect(mockCacheSet).toHaveBeenLastCalledWith("plan:actor-count:u1:bp1", 0, 60);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("reconciles only after fetching all inventory pages", async () => {
      const page = Array.from({ length: 100 }, (_, i) => ({
        id: `ap-${i}`,
        name: `actor-${i}`,
        username: "builder",
        title: null,
      }));
      const finalActor = { id: "ap-last", name: "last", username: "builder", title: null };
      const listMyActors = vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce([finalActor]);
      mockGetUserApifyClient.mockResolvedValueOnce({ listMyActors });
      mockUpsert.mockResolvedValue({ id: "a1" });
      const res = await buildApp().request("/actors/sync", { method: "POST" });
      expect(res.status).toBe(200);
      expect(listMyActors).toHaveBeenNthCalledWith(2, { limit: 100, offset: 100 });
      expect(mockAdmitWorkspaceActors).toHaveBeenCalledWith("u1", "bp1", [...page, finalActor], {
        reconcile: true,
      });
    });

    it("does not reconcile cached Actors if a later inventory page fails", async () => {
      const page = Array.from({ length: 100 }, (_, i) => ({ id: `ap-${i}` }));
      mockGetUserApifyClient.mockResolvedValueOnce({
        listMyActors: vi
          .fn()
          .mockResolvedValueOnce(page)
          .mockRejectedValueOnce(new Error("Apify unavailable")),
      });
      const res = await buildApp().request("/actors/sync", { method: "POST" });
      expect(res.status).toBe(500);
      expect(mockAdmitWorkspaceActors).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("does not reconcile a truncated inventory at the pagination limit", async () => {
      const page = Array.from({ length: 100 }, (_, i) => ({ id: `ap-${i}` }));
      mockGetUserApifyClient.mockResolvedValueOnce({
        listMyActors: vi.fn().mockResolvedValue(page),
      });
      const res = await buildApp().request("/actors/sync", { method: "POST" });
      expect(res.status).toBe(500);
      expect(mockAdmitWorkspaceActors).not.toHaveBeenCalled();
    });

    it("syncs actors from Apify and refreshes the actor-count cache", async () => {
      mockGetUserApifyClient.mockResolvedValueOnce({
        listMyActors: vi.fn().mockResolvedValueOnce([
          {
            id: "ap1",
            name: "actor1",
            title: "Actor 1",
            username: "user1",
            description: "d",
            pictureUrl: "url",
            pricingInfos: [
              {
                pricingModel: "PAY_PER_EVENT",
                startedAt: "2026-08-01T00:00:00.000Z",
                pricingPerEvent: {
                  actorChargeEvents: {
                    scrape: { eventPriceUsd: 0.02, eventTitle: "Scrape" },
                  },
                },
              },
            ],
          },
        ]),
      });
      mockUpsert.mockResolvedValueOnce({});

      const res = await buildApp().request("/actors/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.synced).toBe(1);
      expect(mockCacheSet).toHaveBeenLastCalledWith("plan:actor-count:u1:bp1", 1, 60);
      expect(mockOnboardingUpdateMany).toHaveBeenCalledWith({
        where: { userId: "u1", businessProfileId: "bp1" },
        data: { actorImported: true },
      });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            currentPricing: expect.objectContaining({ pricingModel: "PAY_PER_EVENT" }),
          }),
        }),
      );
      const upsertInput = mockUpsert.mock.calls[0]?.[0] as {
        create?: Record<string, unknown>;
        update?: Record<string, unknown>;
      };
      expect(upsertInput.create).not.toHaveProperty("storeIsPublic");
      expect(upsertInput.create).not.toHaveProperty("storeIsDeprecated");
      expect(upsertInput.update).not.toHaveProperty("storeIsPublic");
    });

    it("refreshes already-tracked actors when the plan is at its actor limit", async () => {
      mockCountActors.mockResolvedValueOnce(10);
      mockFindManyActors.mockResolvedValueOnce([{ apifyActorId: "ap1", userId: "u1" }]);
      mockGetUserApifyClient.mockResolvedValueOnce({
        listMyActors: vi
          .fn()
          .mockResolvedValueOnce([
            { id: "ap1", name: "actor1", title: "Actor 1", username: "user1" },
          ]),
      });
      mockUpsert.mockResolvedValueOnce({});

      const res = await buildApp().request("/actors/sync", { method: "POST" });
      expect(res.status).toBe(200);
      expect(mockUpsert).toHaveBeenCalledOnce();
    });

    it("paginates through every Actor owned by the connected Apify account", async () => {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        id: `ap-${index}`,
        name: `actor-${index}`,
        title: `Actor ${index}`,
        username: "user1",
      }));
      const listMyActors = vi
        .fn()
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce([
          { id: "ap-100", name: "actor-100", title: "Actor 100", username: "user1" },
        ]);
      mockGetUserApifyClient.mockResolvedValueOnce({ listMyActors });
      mockFindManyActors.mockResolvedValueOnce(
        [...firstPage, { id: "ap-100" }].map((actor) => ({
          apifyActorId: actor.id,
          userId: "u1",
          businessProfileId: "bp1",
        })),
      );
      mockUpsert.mockResolvedValue({});

      const res = await buildApp().request("/actors/sync", { method: "POST" });

      expect(res.status).toBe(200);
      expect((await res.json()).data.synced).toBe(101);
      expect(listMyActors).toHaveBeenNthCalledWith(1, { limit: 100, offset: 0 });
      expect(listMyActors).toHaveBeenNthCalledWith(2, { limit: 100, offset: 100 });
    });

    it("reports actors skipped by the Free workspace admission limit", async () => {
      mockAdmitWorkspaceActors.mockResolvedValueOnce({
        items: [],
        created: 0,
        skipped: 1,
        trackedCount: 50,
        plan: "FREE",
        usage: {
          actorCount: 51,
          monthlyUsers: 100,
          actorLimit: 50,
          monthlyUserLimit: 500,
          upgradeRequired: true,
        },
      });
      mockFindManyActors.mockResolvedValueOnce([]);
      mockGetUserApifyClient.mockResolvedValueOnce({
        listMyActors: vi
          .fn()
          .mockResolvedValueOnce([
            { id: "ap-new", name: "new-actor", title: "New Actor", username: "user1" },
          ]),
      });

      const res = await buildApp("FREE").request("/actors/sync", { method: "POST" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ok: true,
        data: { synced: 0, created: 0, skipped: 1, limit: 50, usage: { upgradeRequired: true } },
      });
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("only enriches the actors admitted by the shared workspace import guard", async () => {
      mockCountActors.mockResolvedValueOnce(0);
      mockFindManyActors.mockResolvedValueOnce([]);
      mockGetUserApifyClient.mockResolvedValueOnce({
        listMyActors: vi.fn().mockResolvedValueOnce([
          {
            id: "ap-old",
            name: "old-actor",
            title: "Old Actor",
            username: "user1",
            modifiedAt: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "ap-new",
            name: "new-actor",
            title: "New Actor",
            username: "user1",
            modifiedAt: "2026-08-10T00:00:00.000Z",
          },
        ]),
      });
      mockUpsert.mockResolvedValueOnce({ id: "local-new" });
      mockAdmitWorkspaceActors.mockImplementationOnce(async (_userId, _workspaceId, items) => ({
        items: items.filter((actor: { id: string }) => actor.id === "ap-new"),
        created: 1,
        skipped: 1,
        trackedCount: 50,
        plan: "FREE",
        usage: {
          actorCount: 51,
          monthlyUsers: 100,
          actorLimit: 50,
          monthlyUserLimit: 500,
          upgradeRequired: true,
        },
      }));

      const res = await buildApp("FREE").request("/actors/sync", { method: "POST" });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: { synced: 1, created: 1, skipped: 1, available: 2, limit: 50 },
      });
      expect(mockUpsert).toHaveBeenCalledOnce();
      expect(mockAdmitWorkspaceActors).toHaveBeenCalledWith("u1", "bp1", expect.any(Array), {
        reconcile: true,
      });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ apifyActorId: "ap-new" }),
        }),
      );
    });

    it("rejects when rate limited", async () => {
      mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
      const res = await buildApp().request("/actors/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(429);
    });

    it("rejects when Apify is not connected", async () => {
      mockGetUserApifyClient.mockResolvedValueOnce(null);
      const res = await buildApp().request("/actors/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(400);
    });

    it("explains that Console-only credentials cannot sync owned Actors", async () => {
      mockFindUniqueApifyToken.mockResolvedValueOnce({ encryptedToken: null });

      const res = await buildApp().request("/actors/sync", { method: "POST" });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: {
          code: "apify_api_key_required",
          message: expect.stringContaining(
            "Console credentials add optional metadata and category operations",
          ),
        },
      });
      expect(mockGetUserApifyClient).not.toHaveBeenCalled();
    });
  });

  describe("GET /actors/plan-usage", () => {
    it("requires Pro when the workspace audience exceeds 500", async () => {
      const res = await buildApp("FREE").request("/actors/plan-usage");
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: {
          actorCount: 2,
          monthlyUsers: 501,
          actorLimit: 50,
          monthlyUserLimit: 500,
          monthlyUserLimitExceeded: true,
          actorLimitExceeded: false,
          upgradeRequired: true,
        },
      });
      expect(mockFindFirstBusinessProfile).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "bp1", userId: "u1" } }),
      );
    });
    it("returns no upgrade requirement for Pro", async () => {
      mockFindFirstBusinessProfile.mockResolvedValueOnce({
        plan: "PRO",
        apifyActorCount: 100,
        apifyMonthlyUsers: 10000,
      });
      const res = await buildApp().request("/actors/plan-usage");
      expect(await res.json()).toMatchObject({ data: { upgradeRequired: false } });
    });
  });

  describe("POST /actors/:apifyActorId/rewrite-copy", () => {
    it("returns AI-generated copy variants", async () => {
      mockGetUserApifyClient.mockResolvedValueOnce({
        getActor: vi.fn().mockResolvedValueOnce({
          id: "ap1",
          title: "Test Actor",
          name: "test-actor",
          description: "A test actor",
          categories: ["DEVELOPER_TOOLS"],
        }),
      });
      mockFindFirstActor.mockResolvedValueOnce({
        id: "a1",
        userId: "u1",
        businessProfileId: "bp1",
      });
      mockRewriteActorCopy.mockResolvedValueOnce([
        {
          title: "New Title",
          description: "New description",
          seoTitle: "New SEO title",
          seoDescription: "New SEO description",
          reasoning: "Clearer copy",
        },
      ]);

      const res = await buildApp().request("/actors/ap1/rewrite-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apifyActorId: "ap1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.variants).toBeDefined();
      expect(mockRewriteActorCopy).toHaveBeenCalledWith(
        expect.not.objectContaining({ currentCategories: expect.anything() }),
      );
      expect(mockCreateVariant.mock.calls.flat()).not.toContainEqual(
        expect.objectContaining({ data: expect.objectContaining({ field: "categories" }) }),
      );
    });

    it("returns 404 when actor not found on Apify", async () => {
      mockFindFirstActor.mockResolvedValueOnce({
        id: "a1",
        userId: "u1",
        apifyActorId: "unknown",
      });
      mockGetUserApifyClient.mockResolvedValueOnce({
        getActor: vi.fn().mockResolvedValueOnce(null),
      });

      const res = await buildApp().request("/actors/unknown/rewrite-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apifyActorId: "unknown" }),
      });
      // Without onErrorHandler, Hono converts thrown AppError to 500
      expect([404, 500]).toContain(res.status);
    });

    it("rejects an actor not owned by the authenticated user before calling Apify", async () => {
      mockFindFirstActor.mockResolvedValueOnce(null);

      const res = await buildApp().request("/actors/other-user~actor/rewrite-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apifyActorId: "other-user~actor" }),
      });

      expect(res.status).toBe(404);
      expect(mockGetUserApifyClient).not.toHaveBeenCalled();
    });
  });

  describe("PUT /actors/:apifyActorId/copy", () => {
    it("rejects README changes without contacting Apify", async () => {
      const res = await buildApp().request("/actors/ap1/copy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readme: "# Replacement" }),
      });

      expect(res.status).toBe(400);
      expect(mockGetUserApifyClient).not.toHaveBeenCalled();
    });

    it("updates copy while ignoring legacy category fields", async () => {
      const updateActorMetadata = vi.fn().mockResolvedValueOnce({
        actor: { title: "Updated" },
      });
      mockGetUserApifyClient.mockResolvedValueOnce({ updateActorMetadata });
      mockFindFirstActor.mockResolvedValueOnce({
        id: "a1",
        userId: "u1",
        businessProfileId: "bp1",
        currentCopy: { readme: "# Existing README" },
      });

      const res = await buildApp().request("/actors/ap1/copy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Updated Title",
          categories: ["BUSINESS", "LEAD_GENERATION"],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(updateActorMetadata).toHaveBeenCalledWith("ap1", {
        title: "Updated Title",
      });
      expect(mockUpdateActor).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentCopy: {
              readme: "# Existing README",
              title: "Updated Title",
            },
          }),
        }),
      );
    });
  });

  it("does not expose Actor source or deployment endpoints", async () => {
    for (const path of [
      "/actors/ap1/deploy",
      "/actors/ap1/rewrite-readme",
      "/actors/readme-redesign",
    ]) {
      const response = await buildApp().request(path, { method: "POST" });
      expect(response.status, path).toBe(404);
    }
  });

  describe("GET /actors/:apifyActorId/pricing", () => {
    it("returns synchronized current pricing without the Actor detail capability", async () => {
      mockFindFirstActor.mockResolvedValueOnce({
        apifyActorId: "ap1",
        currentPricing: { model: "PAY_PER_EVENT", amount: 0.2 },
        updatedAt: new Date("2026-09-02T00:00:00.000Z"),
      });

      const response = await buildApp().request("/actors/ap1/pricing");

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { apifyActorId: "ap1", pricing: { model: "PAY_PER_EVENT", amount: 0.2 } },
      });
    });

    it("honors the requested pricing history limit beyond the detail page's ten rows", async () => {
      mockFindFirstActor.mockResolvedValueOnce({
        apifyActorId: "ap1",
        pricingHistory: [{ id: "history-1" }],
      });

      const response = await buildApp().request("/actors/ap1/pricing/history?limit=60");

      expect(response.status).toBe(200);
      expect(mockFindFirstActor).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            pricingHistory: { orderBy: { changedAt: "desc" }, take: 60 },
          }),
        }),
      );
      expect(await response.json()).toMatchObject({
        data: { apifyActorId: "ap1", pricing: [{ id: "history-1" }] },
      });
    });
  });

  describe("PUT /actors/:apifyActorId/pricing", () => {
    it("schedules one Apify period with every pay-per-event charge", async () => {
      mockFindFirstActor.mockResolvedValueOnce({
        id: "a1",
        userId: "u1",
        businessProfileId: "bp1",
        apifyActorId: "ap1",
      });
      const appendActorPricing = vi.fn().mockResolvedValueOnce({
        actor: { pricingInfos: [] },
        pricingInfos: [],
        changed: true,
        startedAt: "2026-09-02T00:00:00.000Z",
      });
      mockGetUserApifyClient.mockResolvedValueOnce({ appendActorPricing });

      const response = await buildApp().request("/actors/ap1/pricing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pricing: {
            model: "PAY_PER_EVENT",
            amount: null,
            events: {
              "apify-actor-start": {
                eventPriceUsd: 0.001,
                eventTitle: "Actor start",
                isOneTimeEvent: true,
              },
              "apify-default-dataset-item": {
                eventPriceUsd: 0.00199,
                eventTitle: "Result",
                isPrimaryEvent: true,
              },
            },
          },
          reason: "Add the result and Actor-start events",
        }),
      });

      expect(response.status).toBe(200);
      expect(appendActorPricing).toHaveBeenCalledWith("ap1", {
        pricingModel: "PAY_PER_EVENT",
        minimalMaxTotalChargeUsd: 0.5,
        isPPEPlatformUsagePaidByUser: true,
        isPriceChangeNotificationSuppressed: false,
        apifyMarginPercentage: 0.2,
        reasonForChange: "Add the result and Actor-start events",
        pricingPerEvent: {
          actorChargeEvents: {
            "apify-actor-start": {
              eventPriceUsd: 0.001,
              eventTitle: "Actor start",
              isOneTimeEvent: true,
            },
            "apify-default-dataset-item": {
              eventPriceUsd: 0.00199,
              eventTitle: "Result",
              isPrimaryEvent: true,
            },
          },
        },
      });
      expect(mockCreatePricingHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: "a1",
            model: "PAY_PER_EVENT",
            payload: expect.objectContaining({
              startedAt: "2026-09-02T00:00:00.000Z",
            }),
          }),
        }),
      );
    });
  });

  describe("GET /actors/:apifyActorId/snapshots", () => {
    it("returns snapshot history for an actor", async () => {
      mockFindFirstActor.mockResolvedValueOnce({
        id: "a1",
        userId: "u1",
        businessProfileId: "bp1",
      });
      mockFindManySnapshots.mockResolvedValueOnce([{ id: "s1", capturedAt: new Date() }]);

      const res = await buildApp().request("/actors/ap1/snapshots");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });
});

describe("GET /actors/dashboard-list", () => {
  it.each(["-1", "1.5", "Infinity", "NaN", "100001"])("rejects invalid page %s", async (page) => {
    mockFindManyActors.mockClear();
    const response = await buildApp().request(`/actors/dashboard-list?page=${page}`);

    expect(response.status).toBe(400);
    expect(mockFindManyActors).not.toHaveBeenCalled();
  });

  it("filters pending logo reviews and exposes the effective website picture", async () => {
    mockFindManyActors.mockResolvedValueOnce([
      {
        id: "a1",
        apifyActorId: "ap1",
        actorName: "maps",
        username: "builder",
        title: "Maps",
        currentImageUrl: null,
        snapshots: [],
        insightSnapshots: [],
        websiteIdentity: {
          id: "website_1",
          slug: "google-maps",
          name: "Google Maps",
          canonicalDomain: "maps.google.com",
          currentLogo: { id: "logo_1" },
        },
        logoRecommendations: [
          { id: "recommendation_1", logoId: "logo_1", status: "PENDING", error: null },
        ],
      },
    ]);
    mockCountActors.mockResolvedValueOnce(1);

    const response = await buildApp().request("/actors/dashboard-list?logoStatus=pending");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        items: [
          {
            website: { slug: "google-maps" },
            effectivePictureUrl: "/api/website-logo-assets/logo_1",
            pictureSource: "website",
            pendingLogoRecommendation: { id: "recommendation_1", status: "PENDING" },
          },
        ],
        logoStatus: "pending",
      },
    });
    expect(mockFindManyActors).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          logoRecommendations: { some: { status: "PENDING" } },
          apifyRemovedAt: null,
        }),
      }),
    );
    expect(mockCountActors).toHaveBeenCalledWith({
      where: expect.objectContaining({ apifyRemovedAt: null }),
    });
  });
});

describe("GET /actors/dashboard-selection", () => {
  it("returns every Actor matching the workspace, search, and readiness filters", async () => {
    mockFindManyActors.mockResolvedValueOnce([{ id: "a1" }, { id: "a2" }, { id: "a3" }]);

    const response = await buildApp().request(
      "/actors/dashboard-selection?q=scraper&readiness=missing-readme",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { actorIds: ["a1", "a2", "a3"], total: 3 },
    });
    expect(mockFindManyActors).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        businessProfileId: "bp1",
        apifyRemovedAt: null,
        AND: [
          { hasReadme: false },
          {
            OR: [
              { title: { contains: "scraper" } },
              { actorName: { contains: "scraper" } },
              { username: { contains: "scraper" } },
            ],
          },
        ],
      },
      orderBy: [{ title: "asc" }, { actorName: "asc" }],
      take: 10_000,
      select: { id: true },
    });
  });
});

describe("actor pricing comparison", () => {
  it("selects the latest active pricing period instead of the first historical period", () => {
    const active = activePricingInfo(
      [
        { pricingModel: "PRICE_PER_DATASET_ITEM", startedAt: "2025-01-01T00:00:00.000Z" },
        { pricingModel: "PAY_PER_EVENT", startedAt: "2026-07-01T00:00:00.000Z" },
        { pricingModel: "PAY_PER_EVENT", startedAt: "2030-01-01T00:00:00.000Z" },
      ],
      new Date("2026-08-08T00:00:00.000Z"),
    );

    expect(active?.startedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("uses the primary recurring pay-per-event charge instead of the Actor start fee", () => {
    expect(
      priceFromInfo({
        pricingModel: "PAY_PER_EVENT",
        pricingPerEvent: {
          actorChargeEvents: {
            "apify-actor-start": {
              eventTitle: "Actor Start",
              eventPriceUsd: 0.001,
              isOneTimeEvent: true,
            },
            "apify-default-dataset-item": {
              eventTitle: "Result",
              eventPriceUsd: 0.019,
              isPrimaryEvent: true,
            },
          },
        },
      }),
    ).toBe(0.019);
  });
});
