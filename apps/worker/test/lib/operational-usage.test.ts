import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    actor: { findUnique: vi.fn(), update: vi.fn() },
    actorRunSnapshot: { findFirst: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    usageDaily: { upsert: vi.fn() },
  },
}));
vi.mock("@actorconsole/db", async () => ({
  db: dbMock,
  Prisma: (await import("@prisma/client")).Prisma,
}));
import { syncActorOperationalData } from "../../src/lib/operational-usage.js";
describe("operational accounting integrity", () => {
  let lastRunSyncAt: Date | null;
  let daily: Map<string, any>;
  let stored: Map<string, any>;
  const runs = [
    {
      id: "morning",
      startedAt: "2026-10-25T06:00:00Z",
      status: "SUCCEEDED",
      usageTotalUsd: 1,
      defaultDatasetId: "morning",
    },
    {
      id: "evening",
      startedAt: "2026-10-25T18:00:00Z",
      status: "SUCCEEDED",
      usageTotalUsd: 2,
      defaultDatasetId: "evening",
    },
    {
      id: "today",
      startedAt: "2026-10-26T05:00:00Z",
      status: "FAILED",
      usageTotalUsd: 3,
      defaultDatasetId: "today",
    },
  ];
  const apify = {
    getActor: vi.fn().mockResolvedValue(null),
    listActorRuns: vi.fn(),
    getDatasetItemCount: vi.fn(),
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    daily = new Map();
    stored = new Map();
    lastRunSyncAt = null;
    dbMock.$transaction.mockImplementation(async (fn) => fn(dbMock));
    dbMock.$queryRaw.mockResolvedValue([{ id: "actor_1" }]);
    dbMock.actor.findUnique.mockImplementation(async () => ({ lastRunSyncAt }));
    dbMock.actor.update.mockImplementation(async ({ data }) => {
      lastRunSyncAt = data.lastRunSyncAt;
    });
    dbMock.actorRunSnapshot.findFirst.mockResolvedValue({
      startedAt: new Date("2026-07-01T00:00:00Z"),
    });
    dbMock.actorRunSnapshot.upsert.mockImplementation(async ({ where, create, update }) => {
      const id = where.actorId_apifyRunId.apifyRunId;
      stored.set(id, stored.has(id) ? { ...stored.get(id), ...update } : create);
      return stored.get(id);
    });
    dbMock.actorRunSnapshot.findMany.mockImplementation(async () => [...stored.values()]);
    dbMock.usageDaily.upsert.mockImplementation(async ({ where, create, update }) => {
      const key = where.actorId_date.date.toISOString();
      daily.set(key, daily.has(key) ? { ...daily.get(key), ...update } : create);
    });
    apify.listActorRuns.mockImplementation(async (_id, { startedAfter }) =>
      runs.filter((run) => Date.parse(run.startedAt) > Date.parse(startedAfter)),
    );
    apify.getDatasetItemCount.mockImplementation(
      async (id) => ({ morning: 2, evening: 3, today: 4 })[id],
    );
  });
  afterEach(() => vi.useRealTimers());
  it("an incremental sync retains the complete prior-day totals", async () => {
    await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
    expect(daily.get("2026-10-25T00:00:00.000Z")).toMatchObject({
      runs: 2,
      usageCostUsd: "3",
      resultCount: 5,
    });
    vi.setSystemTime(new Date("2026-10-26T18:00:00Z"));
    await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
    expect(daily.get("2026-10-25T00:00:00.000Z")).toMatchObject({
      runs: 2,
      usageCostUsd: "3",
      resultCount: 5,
    });
  });
  it("a transient dataset outage must not erase a previously known count", async () => {
    await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
    expect(daily.get("2026-10-26T00:00:00.000Z").resultCount).toBe(4);
    apify.getDatasetItemCount.mockRejectedValue(new Error("Temporary upstream outage"));
    await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
    expect(daily.get("2026-10-26T00:00:00.000Z").resultCount).toBe(4);
  });
  it("stores a verified zero and marks first-ever failures as unverified", async () => {
    apify.getDatasetItemCount.mockRejectedValue(new Error("Temporary upstream outage"));
    await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
    expect(stored.get("today").resultCountSyncedAt).toBeNull();
    apify.getDatasetItemCount.mockResolvedValue(0);
    await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
    expect(stored.get("today")).toMatchObject({
      resultCount: 0,
      resultCountSyncedAt: expect.any(Date),
    });
  });
  it("deduplicates repeated provider run IDs on every retry", async () => {
    apify.listActorRuns.mockResolvedValue([...runs, runs[0]]);
    await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
    await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
    expect(daily.get("2026-10-25T00:00:00.000Z")).toMatchObject({
      runs: 2,
      usageCostUsd: "3",
      resultCount: 5,
    });
  });
  it("does not publish a truncated run page as complete usage", async () => {
    apify.listActorRuns.mockImplementation(async (_id, { limit }) =>
      limit === 1 ? [runs[0]] : Array(1000).fill(runs[0]),
    );
    await expect(
      syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" }),
    ).rejects.toThrow("complete backfill");
    expect(daily.size).toBe(0);
  });
});
