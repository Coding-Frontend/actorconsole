import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { dbMock } = vi.hoisted(() => ({ dbMock: {
 actor: { findUnique: vi.fn(), update: vi.fn() },
 actorRunSnapshot: { findFirst: vi.fn(), upsert: vi.fn() },
 usageDaily: { upsert: vi.fn() },
} }));
vi.mock("@actorconsole/db", () => ({ db: dbMock }));
import { syncActorOperationalData } from "./operational-fixture.js";
describe("untouched baseline operational accounting", () => {
 let lastRunSyncAt: Date | null;
 let daily: Map<string, any>;
 const runs = [
  { id: "morning", startedAt: "2026-10-25T06:00:00Z", status: "SUCCEEDED", usageTotalUsd: 1, defaultDatasetId: "morning" },
  { id: "evening", startedAt: "2026-10-25T18:00:00Z", status: "SUCCEEDED", usageTotalUsd: 2, defaultDatasetId: "evening" },
  { id: "today", startedAt: "2026-10-26T05:00:00Z", status: "FAILED", usageTotalUsd: 3, defaultDatasetId: "today" },
 ];
 const apify = { getActor: vi.fn().mockResolvedValue(null), listActorRuns: vi.fn(), getDatasetItemCount: vi.fn() };
 beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  daily = new Map(); lastRunSyncAt = null;
  dbMock.actor.findUnique.mockImplementation(async () => ({ lastRunSyncAt }));
  dbMock.actor.update.mockImplementation(async ({ data }) => { lastRunSyncAt = data.lastRunSyncAt; });
  dbMock.actorRunSnapshot.findFirst.mockResolvedValue({ startedAt: new Date("2026-07-01T00:00:00Z") });
  dbMock.actorRunSnapshot.upsert.mockResolvedValue({});
  dbMock.usageDaily.upsert.mockImplementation(async ({ where, create, update }) => {
   const key=where.actorId_date.date.toISOString();
   daily.set(key, daily.has(key) ? { ...daily.get(key), ...update } : create);
  });
  apify.listActorRuns.mockImplementation(async (_id, { startedAfter }) => runs.filter((run) => Date.parse(run.startedAt) > Date.parse(startedAfter)));
  apify.getDatasetItemCount.mockImplementation(async (id) => ({ morning: 2, evening: 3, today: 4 })[id]);
 });
 afterEach(() => vi.useRealTimers());
 it("audit fixture: an incremental sync retains the complete prior-day totals", async () => {
  await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
  expect(daily.get("2026-10-25T00:00:00.000Z")).toMatchObject({ runs: 2, usageCostUsd: "3", resultCount: 5 });
  vi.setSystemTime(new Date("2026-10-26T18:00:00Z"));
  await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
  expect(daily.get("2026-10-25T00:00:00.000Z")).toMatchObject({ runs: 2, usageCostUsd: "3", resultCount: 5 });
 });
 it("audit fixture: a transient dataset outage must not erase a previously known count", async () => {
  await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
  expect(daily.get("2026-10-26T00:00:00.000Z").resultCount).toBe(4);
  apify.getDatasetItemCount.mockRejectedValue(new Error("Temporary upstream outage"));
  await syncActorOperationalData(apify as never, { id: "actor_1", apifyActorId: "remote_1" });
  expect(daily.get("2026-10-26T00:00:00.000Z").resultCount).toBe(4);
 });
});
