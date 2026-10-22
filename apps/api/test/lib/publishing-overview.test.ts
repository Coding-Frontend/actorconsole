import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSession } from "@actorconsole/shared";

const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  inventory: vi.fn(),
  scheduleCounts: vi.fn(),
  queue: vi.fn(),
  total: vi.fn(),
  schedules: vi.fn(),
  operations: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    businessProfile: { findMany: mocks.profiles },
    actor: { groupBy: mocks.inventory },
    bulkPublishSchedule: {
      groupBy: mocks.scheduleCounts,
      count: mocks.total,
      findMany: mocks.schedules,
    },
    bulkPublishScheduleActor: { groupBy: mocks.queue },
    bulkActorStatusOperation: { findMany: mocks.operations },
  },
}));
import { loadPublishingOverview } from "../../src/lib/publishing-overview.js";
const session: UserSession = {
  userId: "u1",
  email: "owner@example.com",
  plan: "FREE",
  businessProfileId: "w1",
};

describe("All Workspaces publishing overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.profiles.mockResolvedValue([
      { id: "w1", name: "Production" },
      { id: "w2", name: "Research" },
    ]);
    mocks.inventory.mockResolvedValue([
      { businessProfileId: "w1", storeIsPublic: true, _count: { _all: 4 } },
      { businessProfileId: "w2", storeIsPublic: false, _count: { _all: 3 } },
      { businessProfileId: "w2", storeIsPublic: null, _count: { _all: 2 } },
    ]);
    mocks.scheduleCounts.mockResolvedValue([
      { businessProfileId: "w1", enabled: true, _count: { _all: 1 } },
      { businessProfileId: "w2", enabled: false, _count: { _all: 1 } },
    ]);
    mocks.queue.mockResolvedValue([
      { scheduleId: "s1", status: "PENDING", _count: { _all: 2 } },
      { scheduleId: "s2", status: "PUBLISHED", _count: { _all: 3 } },
      { scheduleId: "s2", status: "FAILED", _count: { _all: 1 } },
      { scheduleId: "s2", status: "BLOCKED", _count: { _all: 1 } },
      { scheduleId: "s2", status: "QUOTA_BLOCKED", _count: { _all: 2 } },
    ]);
    mocks.total.mockResolvedValue(2);
    mocks.schedules.mockResolvedValue([
      {
        id: "s2",
        name: "Daily",
        businessProfileId: "w2",
        enabled: false,
        nextRunAt: null,
        quotaBlockedUntil: null,
        businessProfile: { name: "Research" },
        _count: { actors: 7 },
        runs: [
          {
            status: "QUOTA_BLOCKED",
            publishedCount: 3,
            startedAt: new Date("2026-10-17T00:00:00Z"),
          },
        ],
      },
    ]);
    mocks.operations.mockResolvedValue([]);
  });
  it("aggregates all owned workspaces while preserving unknown visibility and paused queues", async () => {
    const result = await loadPublishingOverview(session);
    expect(result.summary).toEqual({
      actors: 9,
      published: 4,
      private: 3,
      unknown: 2,
      schedules: 2,
      activeSchedules: 1,
      pending: 2,
      queuedPublished: 3,
      failed: 1,
      blocked: 3,
    });
    expect(result.workspaces[1]).toMatchObject({
      id: "w2",
      actors: 5,
      published: 0,
      private: 3,
      unknown: 2,
      schedules: 1,
    });
    expect(result.schedules[0]).toMatchObject({
      workspaceId: "w2",
      workspaceName: "Research",
      enabled: false,
      published: 3,
      blocked: 3,
      lastRun: { startedAt: "2026-10-17T00:00:00.000Z" },
    });
    const scope = { userId: "u1", businessProfile: { userId: "u1" } };
    expect(mocks.inventory).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ...scope, apifyRemovedAt: null } }),
    );
    for (const mock of [mocks.scheduleCounts, mocks.total, mocks.schedules, mocks.operations]) {
      expect(mock).toHaveBeenCalledWith(expect.objectContaining({ where: scope }));
    }
    expect(mocks.queue).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schedule: scope } }),
    );
    expect(session.businessProfileId).toBe("w1");
  });
  it("rejects workspace API keys before reading account-wide data", async () => {
    await expect(
      loadPublishingOverview({ ...session, authMethod: "api-key" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.profiles).not.toHaveBeenCalled();
    expect(mocks.inventory).not.toHaveBeenCalled();
  });
  it("clamps stale pagination while totals still include schedules on other pages", async () => {
    mocks.total.mockResolvedValue(26);
    const result = await loadPublishingOverview(session, 100);
    expect(result).toMatchObject({ page: 2, pageSize: 25, totalSchedules: 26 });
    expect(mocks.schedules).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25 }));
    expect(result.summary.pending).toBe(2);
  });
  it("returns empty totals for an account with no workspaces", async () => {
    for (const mock of [
      mocks.profiles,
      mocks.inventory,
      mocks.scheduleCounts,
      mocks.queue,
      mocks.schedules,
    ])
      mock.mockResolvedValue([]);
    mocks.total.mockResolvedValue(0);
    const result = await loadPublishingOverview(session);
    expect(result.summary.actors).toBe(0);
    expect(result.workspaces).toEqual([]);
    expect(result.schedules).toEqual([]);
  });
  it("surfaces unavailable data rather than displaying misleading zero totals", async () => {
    mocks.inventory.mockRejectedValue(new Error("Database unavailable"));
    await expect(loadPublishingOverview(session)).rejects.toThrow("Database unavailable");
  });
});
