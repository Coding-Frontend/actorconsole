import { describe, expect, it } from "vitest";
import {
  buildActorInsightRows,
  extractInsightUserDays,
  insightMonths,
} from "../../src/lib/actor-insights.js";

describe("Actor insight snapshots", () => {
  it("normalizes dated user-count payload variants", () => {
    const days = extractInsightUserDays({
      values: [{ date: "2026-08-10", activeUsers: 4, totalUsers: 9 }],
    });
    expect(days.get("2026-08-10")).toEqual({ activeUsers: 4, totalUsers: 9 });
  });

  it("does not double-count aggregate users alongside free and paying breakdowns", () => {
    const days = extractInsightUserDays({
      values: [
        {
          date: "2026-08-10",
          activeUsers: 9,
          freeUsers: 6,
          payingUsers: 3,
          totalUsers: 20,
        },
      ],
    });
    expect(days.get("2026-08-10")).toEqual({ activeUsers: 9, totalUsers: 20 });
  });

  it("sums free and paying users when no aggregate is provided", () => {
    const days = extractInsightUserDays({
      values: [{ date: "2026-08-10", freeUsers: 6, payingUsers: 3 }],
    });
    expect(days.get("2026-08-10")).toEqual({ activeUsers: 9 });
  });

  it("creates historical daily rows and adds current acquisition and quality", () => {
    const rows = buildActorInsightRows({
      analytics: [
        {
          month: "2026-08-01",
          actorIds: ["actor-1"],
          actorBreakdown: {},
          costsPerThousandResults: {},
          runStatistics: {
            dailyStats: { "2026-08-10": { TOTAL: 10, SUCCEEDED: 8, FAILED: 2, RESULTS: 100 } },
            runsSummary: { min: 1, max: 10, avg: 5 },
            resultsSummary: { min: 2, max: 100, avg: 50 },
          },
          userCountStatistics: { "2026-08-10": { activeUsers: 3 } },
          profitMargin: {
            dailyProfitMarginStats: {
              "2026-08-10": {
                payingUsersUsd: { costUsd: 1, revenueUsd: 3, profitUsd: 2, margin: 0.66 },
                allUsersUsd: { costUsd: 2, revenueUsd: 9, profitUsd: 7, margin: 0.77 },
              },
            },
          },
          availability: {
            actorBreakdown: true,
            costsPerThousandResults: true,
            runStatistics: true,
            userCountStatistics: true,
            profitMargin: true,
          },
          errors: {},
        },
      ],
      acquisition: {
        monthStartAt: "2026-08-01T00:00:00.000Z",
        actorIds: ["actor-1"],
        numUniqueViewingUsers: 25,
        numUniqueConsolePageViews: 40,
        numUniqueUsersWithRun: 7,
        topReferrers: [],
        topCountryCodes: [],
      },
      quality: {
        scores: {
          hasInputSchema: 1,
          hasOutputSchema: 1,
          hasReadme: 1,
          actorQuality: 0.9,
          actorQualityPercentile: 0.8,
        },
        praises: [],
        improvements: [],
      },
      now: new Date("2026-08-12T10:00:00.000Z"),
      syncStatus: "COMPLETE",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      totalRuns: 10,
      succeededRuns: 8,
      successRate: 0.8,
      revenueUsd: 3,
      runStatistics: {
        runsSummary: { min: 1, max: 10, avg: 5 },
        resultsSummary: { min: 2, max: 100, avg: 50 },
      },
    });
    expect(rows[1]).toMatchObject({
      uniqueStoreViewers: 25,
      usersWithRun: 7,
      qualityScore: 0.9,
      acquisition: { periods: [{ numUniqueViewingUsers: 25 }] },
    });
  });

  it("selects three calendar months for bootstrap", () => {
    expect(insightMonths(new Date("2026-01-10T00:00:00Z"), 3)).toEqual([
      "2026-01-01",
      "2025-12-01",
      "2025-11-01",
    ]);
  });

  it("keeps missing paying-user cost unknown instead of substituting all-run cost", () => {
    const rows = buildActorInsightRows({
      analytics: [
        {
          month: "2026-08-01",
          actorIds: ["actor-1"],
          actorBreakdown: {},
          costsPerThousandResults: { dailyActorRunsCost: { "2026-08-10": 9 } },
          runStatistics: {},
          userCountStatistics: {},
          profitMargin: {
            dailyProfitMarginStats: {
              "2026-08-10": {
                payingUsersUsd: {
                  revenueUsd: 3,
                  costUsd: null as unknown as number,
                  profitUsd: 3,
                  margin: 1,
                },
              },
            },
          },
          availability: {
            actorBreakdown: true,
            costsPerThousandResults: true,
            runStatistics: true,
            userCountStatistics: true,
            profitMargin: true,
          },
          errors: {},
        },
      ],
      now: new Date("2026-08-12T10:00:00Z"),
      syncStatus: "COMPLETE",
    });
    expect(rows[0]).toMatchObject({ revenueUsd: 3, costUsd: null });
  });
});
