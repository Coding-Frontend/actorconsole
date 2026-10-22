import { describe, expect, it } from "vitest";
import {
  calculateActorRows,
  calculateRevenueActorRows,
  preferredHistoricalMonth,
  resolveCurrentServiceEntries,
  type UsageCostsPayload,
} from "./usage-costs-analytics";

function payload(): UsageCostsPayload {
  const now = new Date();
  const date = `${now.toISOString().slice(0, 7)}-02T00:00:00.000Z`;
  return {
    latestSyncAt: null,
    items: [
      {
        id: "one",
        apifyActorId: "apify-one",
        title: "One",
        actorName: "one",
        username: "builder",
        lastRunSyncAt: null,
        usageDaily: [{ date, runs: 3, usageCostUsd: 0.5 }],
      },
      {
        id: "two",
        apifyActorId: "apify-two",
        title: "Two",
        actorName: "two",
        username: "builder",
        lastRunSyncAt: null,
        usageDaily: [{ date, runs: 1, usageCostUsd: 0.25 }],
      },
      {
        id: "zero",
        apifyActorId: "apify-zero",
        title: "Zero",
        actorName: "zero",
        username: "builder",
        lastRunSyncAt: null,
        usageDaily: [],
      },
    ],
    accountUsage: null,
  };
}

describe("usage cost Actor breakdown", () => {
  it("uses the Actor subtotal for shares and excludes empty Actors", () => {
    const rows = calculateActorRows(payload());

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: "One", share: 66.66666666666666 });
    expect(rows[1]).toMatchObject({ title: "Two", share: 33.33333333333333 });
    expect(rows.reduce((total, row) => total + row.share, 0)).toBeCloseTo(100);
  });

  it("applies the shared Actor scope to usage breakdowns", () => {
    const input = payload();
    input.filters = {
      from: new Date().toISOString().slice(0, 7) + "-01",
      to: new Date().toISOString().slice(0, 10),
      previousFrom: "2026-07-01",
      previousTo: "2026-07-31",
      actorIds: ["two"],
      granularity: "day",
      mode: "absolute",
      timeZone: "UTC",
    };

    expect(calculateActorRows(input)).toEqual([
      expect.objectContaining({ id: "two", title: "Two", share: 100 }),
    ]);
  });

  it("uses the synchronized Actor revenue subtotal for revenue shares", () => {
    const input = payload();
    input.revenue = {
      syncedAt: "2026-08-12T00:00:00.000Z",
      daily: [],
      monthly: [],
      ledger: [],
      comparison: {
        current: {
          costUsd: 3,
          allocatedCostUsd: 3,
          revenueUsd: 10,
          profitUsd: 7,
          netProfitUsd: 7,
          runs: 6,
          results: 30,
          activeUsers: 0,
          costCoveredDays: 2,
          allocatedCoveredDays: 2,
        },
        previous: {
          costUsd: 0,
          allocatedCostUsd: 0,
          revenueUsd: 0,
          profitUsd: 0,
          netProfitUsd: 0,
          runs: 0,
          results: 0,
          activeUsers: 0,
          costCoveredDays: 0,
          allocatedCoveredDays: 0,
        },
      },
      coverage: {
        workspaceActors: 3,
        selectedActors: 3,
        actorsWithRevenue: 2,
        rows: 2,
        costCoveredRows: 2,
        allocatedCostCoveredRows: 2,
        failedActorSyncs: 0,
        officialCurrentMonthCoveredActors: 2,
      },
      unavailableActors: 1,
      actors: [
        {
          id: "one",
          apifyActorId: "apify-one",
          title: "One",
          actorName: "one",
          username: "builder",
          costUsd: 2,
          allocatedCostUsd: 2,
          revenueUsd: 8,
          profitUsd: 6,
          netProfitUsd: 6,
          margin: 75,
          runs: 4,
          results: 20,
          activeUsers: 0,
          previousRevenueUsd: 6,
          previousNetProfitUsd: 4,
          previousRuns: 3,
          previousResults: 15,
          costAvailable: true,
          allocatedCostAvailable: true,
        },
        {
          id: "two",
          apifyActorId: "apify-two",
          title: "Two",
          actorName: "two",
          username: "builder",
          costUsd: 1,
          allocatedCostUsd: 1,
          revenueUsd: 2,
          profitUsd: 1,
          netProfitUsd: 1,
          margin: 50,
          runs: 2,
          results: 10,
          activeUsers: 0,
          previousRevenueUsd: 1,
          previousNetProfitUsd: 0.5,
          previousRuns: 1,
          previousResults: 5,
          costAvailable: true,
          allocatedCostAvailable: true,
        },
        {
          id: "empty",
          apifyActorId: "apify-empty",
          title: "Empty",
          actorName: "empty",
          username: "builder",
          costUsd: 0,
          allocatedCostUsd: 0,
          revenueUsd: 0,
          profitUsd: 0,
          netProfitUsd: 0,
          margin: null,
          runs: 0,
          results: 0,
          activeUsers: 0,
          previousRevenueUsd: 0,
          previousNetProfitUsd: 0,
          previousRuns: 0,
          previousResults: 0,
          costAvailable: false,
          allocatedCostAvailable: false,
        },
      ],
    };

    const rows = calculateRevenueActorRows(input);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: "One", share: 80 });
    expect(rows[1]).toMatchObject({ title: "Two", share: 20 });
    expect(rows.reduce((total, row) => total + row.share, 0)).toBeCloseTo(100);

    input.filters = {
      from: "2026-08-01",
      to: "2026-08-12",
      previousFrom: "2026-07-20",
      previousTo: "2026-07-31",
      actorIds: ["one", "empty"],
      granularity: "day",
      mode: "absolute",
      timeZone: "UTC",
    };
    input.revenue!.actors = input.revenue!.actors.filter((actor) =>
      input.filters?.actorIds.includes(actor.id),
    );

    expect(calculateRevenueActorRows(input)).toEqual([
      expect.objectContaining({ id: "one", share: 100 }),
      expect.objectContaining({ id: "empty", share: 0 }),
    ]);
  });

  it("defaults historical detail to the latest month with meaningful usage", () => {
    expect(
      preferredHistoricalMonth([
        { month: "2026-06", cost: 8 },
        { month: "2026-07", cost: 4 },
        { month: "2026-08", cost: 0 },
      ]),
    ).toBe("2026-07");
    expect(preferredHistoricalMonth([{ month: "2026-08", cost: 0 }])).toBe("2026-08");
    expect(preferredHistoricalMonth([])).toBeNull();
  });

  it("uses current calendar services when Apify returns an empty current-cycle summary", () => {
    const currentService = {
      quantity: 2,
      baseAmountUsd: 10,
      baseUnitPriceUsd: 5,
      amountAfterVolumeDiscountUsd: 9,
    };
    const account = {
      monthly: null,
      actors: { current: null, previous: null },
      currentServices: null,
      unavailable: 0,
      currentPeriod: {
        usage: {
          usageCycle: { startAt: "2026-08-01", endAt: "2026-09-01" },
          monthlyServiceUsage: {},
          dailyServiceUsages: [],
          totalUsageCreditsUsdBeforeVolumeDiscount: 0,
          totalUsageCreditsUsdAfterVolumeDiscount: 0,
        },
        limits: null,
      },
      calendarMonth: {
        dailyServiceUsage: {},
        monthlyServiceUsage: { ACTOR_COMPUTE_UNITS: currentService },
      },
    } as UsageCostsPayload["accountUsage"];

    expect(resolveCurrentServiceEntries(account)).toEqual([
      ["ACTOR_COMPUTE_UNITS", currentService],
    ]);
  });
});
