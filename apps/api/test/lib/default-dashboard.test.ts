import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSession } from "@actorconsole/shared";

const { profiles, report } = vi.hoisted(() => ({ profiles: vi.fn(), report: vi.fn() }));
vi.mock("@actorconsole/db", () => ({ db: { businessProfile: { findMany: profiles } } }));
vi.mock("../../src/lib/financial-report.js", () => ({ loadWorkspaceFinancialReport: report }));
import { loadDefaultDashboard } from "../../src/lib/default-dashboard.js";

const session: UserSession = {
  userId: "u1",
  email: "owner@example.com",
  plan: "PRO",
  businessProfileId: "w1",
};
function data(revenueUsd: number | null, usageCostUsd: number | null, billing = 100) {
  return {
    data: {
      meta: { syncedAt: "2026-10-08T01:00:00Z" },
      accountDailyCosts:
        usageCostUsd === null ? [] : [{ date: "2026-10-07", usageCostUsd: usageCostUsd + 1 }],
      accountUsage: {
        ownerMonetization: {
          month: "2026-10",
          actors: [{ earningsStats: { totalRevenueUsd: billing } }],
        },
      },
      revenue: {
        daily: [
          {
            date: "2026-10-07",
            revenueUsd: revenueUsd ?? 0,
            costUsd: usageCostUsd ?? 0,
            revenueCoveredDays: revenueUsd === null ? 0 : 1,
            costCoveredDays: usageCostUsd === null ? 0 : 1,
            runs: 3,
          },
        ],
        unavailableActors: revenueUsd === null ? 1 : 0,
        coverage: {
          failedActorSyncs: 0,
          rows: 1,
          revenueCoveredRows: revenueUsd === null ? 0 : 1,
          costCoveredRows: usageCostUsd === null ? 0 : 1,
        },
      },
    },
  };
}

describe("Default dashboard aggregation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
    profiles.mockResolvedValue([
      { id: "w1", name: "First", plan: "PRO" },
      { id: "w2", name: "Second", plan: "FREE" },
    ]);
    report.mockResolvedValue(data(10, 2));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("combines owned workspaces by day, uses account costs, and preserves the active session", async () => {
    report.mockImplementation(({ session: scope }) =>
      Promise.resolve(scope.businessProfileId === "w1" ? data(10, 2, 100) : data(20, 3, 200)),
    );
    const result = await loadDefaultDashboard(session, { from: "2026-10-07", to: "2026-10-08" });
    expect(profiles).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    expect(report.mock.calls.map(([input]) => input.session.businessProfileId)).toEqual([
      "w1",
      "w2",
    ]);
    expect(report.mock.calls[1]![0].session).toMatchObject({ userId: "u1", plan: "FREE" });
    expect(session.businessProfileId).toBe("w1");
    expect(result.summary).toEqual({ revenueUsd: 30, usageCostUsd: 7, earningsUsd: 23, runs: 6 });
    expect(result.currentBillingRevenueUsd).toBe(300);
    expect(result.billingWorkspacesCovered).toBe(2);
    expect(result.daily[0]).toMatchObject({
      date: "2026-10-07",
      revenueUsd: 30,
      usageCostUsd: 7,
      earningsUsd: 23,
      workspacesCovered: 2,
    });
    expect(result.daily[1]).toMatchObject({
      date: "2026-10-08",
      revenueUsd: null,
      usageCostUsd: null,
      earningsUsd: null,
      runs: 0,
    });
    expect(result.partial).toBe(false);
  });

  it("distinguishes reported zero from missing data and does not invent earnings", async () => {
    report.mockImplementation(({ session: scope }) => {
      const value = scope.businessProfileId === "w1" ? data(0, 2) : data(null, 4);
      value.data.accountUsage = null as never;
      return Promise.resolve(value);
    });
    const result = await loadDefaultDashboard(session, { from: "2026-10-07", to: "2026-10-07" });
    expect(result.summary).toEqual({ revenueUsd: 0, usageCostUsd: 8, earningsUsd: -3, runs: 6 });
    expect(result.workspaces[1]).toMatchObject({
      revenueUsd: null,
      earningsUsd: null,
      partial: true,
    });
    expect(result.currentBillingRevenueUsd).toBeNull();
    expect(result.partial).toBe(true);
  });

  it("does not subtract costs from a different day to invent earnings", async () => {
    const value = data(10, null);
    value.data.accountDailyCosts.push({ date: "2026-10-08", usageCostUsd: 5 });
    report.mockResolvedValue(value);
    const result = await loadDefaultDashboard(session, { from: "2026-10-07", to: "2026-10-08" });
    expect(result.summary).toMatchObject({ revenueUsd: 20, usageCostUsd: 10, earningsUsd: null });
  });

  it("keeps available data when one workspace fails and marks partial coverage", async () => {
    report
      .mockRejectedValueOnce(new Error("Database unavailable"))
      .mockResolvedValueOnce(data(20, 3));
    const result = await loadDefaultDashboard(session, { from: "2026-10-07", to: "2026-10-07" });
    expect(result.summary.revenueUsd).toBe(20);
    expect(result.workspaces[0]).toMatchObject({
      revenueUsd: null,
      usageCostUsd: null,
      earningsUsd: null,
      partial: true,
    });
    expect(result.partial).toBe(true);
  });

  it("reports failure when all workspace reports fail", async () => {
    report.mockRejectedValue(new Error("Offline"));
    await expect(loadDefaultDashboard(session, {})).rejects.toMatchObject({ status: 503 });
  });

  it.each([0, 1])("requires at least two workspaces (count %s)", async (count) => {
    profiles.mockResolvedValue(count ? [{ id: "w1", name: "Only", plan: "PRO" }] : []);
    await expect(loadDefaultDashboard(session, {})).rejects.toMatchObject({
      code: "default_unavailable",
      status: 409,
    });
    expect(report).not.toHaveBeenCalled();
  });

  it("rejects workspace-bound API keys before reading account data", async () => {
    await expect(
      loadDefaultDashboard({ ...session, authMethod: "api-key" }, {}),
    ).rejects.toMatchObject({ status: 403 });
    expect(profiles).not.toHaveBeenCalled();
  });

  it.each([
    { from: "2026-02-30" },
    { from: "2026-10-08", to: "2026-10-07" },
    { from: "2024-01-01", to: "2026-10-08" },
  ])("rejects invalid dates and ranges before querying reports", async (params) => {
    await expect(loadDefaultDashboard(session, params)).rejects.toMatchObject({ status: 400 });
    expect(report).not.toHaveBeenCalled();
  });

  it("ignores stale billing-month monetization", async () => {
    const value = data(10, 2);
    value.data.accountUsage.ownerMonetization.month = "2026-09";
    report.mockResolvedValue(value);
    expect((await loadDefaultDashboard(session, {})).currentBillingRevenueUsd).toBeNull();
  });
});
