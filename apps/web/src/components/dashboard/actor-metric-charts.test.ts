import { describe, expect, it } from "vitest";
import {
  buildActorMetricDisplayPoints,
  buildActorMetricPoints,
  extractUserCountDays,
} from "./actor-metric-charts";

describe("actor metric chart normalization", () => {
  it("accepts wrapped array and date-keyed Console user-count payloads", () => {
    const days = extractUserCountDays({
      data: {
        values: [
          { date: "2026-08-09", activeUsers: 12, totalUsers: 40 },
          { day: "2026-08-10", value: 14 },
        ],
        dailyUsers: {
          "2026-08-11": { userCount: 16, cumulativeUsers: 45 },
        },
      },
    });

    expect(days.get("2026-08-09")).toEqual({ activeUsers: 12, totalUsers: 40 });
    expect(days.get("2026-08-10")).toEqual({ activeUsers: 14 });
    expect(days.get("2026-08-11")).toEqual({ activeUsers: 16, totalUsers: 45 });
  });

  it("prefers Console run analytics and preserves uncaptured days as null", () => {
    const points = buildActorMetricPoints({
      now: new Date("2026-08-11T12:00:00.000Z"),
      snapshots: [
        {
          id: "snapshot-1",
          capturedAt: "2026-08-10T18:00:00.000Z",
          runs30d: 229,
          monthlyUsers: 12,
          usersTotal: 14,
        },
      ],
      usageDaily: [{ date: "2026-08-10", runs: 4 }],
      metricAnalytics: [
        {
          runStatistics: { dailyStats: { "2026-08-10": { TOTAL: 9 } } },
          userCountStatistics: {
            values: [{ date: "2026-08-11", activeUsers: 13, totalUsers: 15 }],
          },
        },
      ],
    });

    expect(points).toHaveLength(90);
    expect(points.find((point) => point.date === "2026-08-09")).toMatchObject({
      runs: null,
      activeUsers: null,
      totalUsers: null,
    });
    expect(points.find((point) => point.date === "2026-08-10")).toMatchObject({
      runs: 9,
      activeUsers: 12,
      totalUsers: 14,
    });
    expect(points.find((point) => point.date === "2026-08-11")).toMatchObject({
      runs: null,
      activeUsers: 13,
      totalUsers: 15,
    });
  });

  it("keeps previous-month observations in the default chart window", () => {
    const points = buildActorMetricPoints({
      now: new Date("2026-08-11T12:00:00.000Z"),
      snapshots: [],
      usageDaily: [{ date: "2026-07-15", runs: 22 }],
      metricAnalytics: [],
    });

    expect(points).toHaveLength(90);
    expect(points.find((point) => point.date === "2026-07-15")?.runs).toBe(22);
  });

  it("shows saved rolling 30-day totals only on their observed snapshot date", () => {
    const points = buildActorMetricPoints({
      now: new Date("2026-08-11T12:00:00.000Z"),
      snapshots: [
        {
          id: "snapshot-1",
          capturedAt: "2026-08-10T18:00:00.000Z",
          runs30d: 734,
          monthlyUsers: 7,
          usersTotal: 23,
        },
      ],
      usageDaily: [],
      metricAnalytics: [],
    });

    expect(points.find((point) => point.date === "2026-08-10")).toMatchObject({
      runs: 734,
      activeUsers: 7,
      totalUsers: 23,
    });
    expect(points.find((point) => point.date === "2026-08-11")).toMatchObject({
      runs: null,
      activeUsers: null,
      totalUsers: null,
    });
  });

  it("cumulates only additive daily metrics without double-counting rolling totals", () => {
    const points = [
      {
        date: "2026-08-10",
        label: "Aug 10",
        runs: 4,
        activeUsers: 3,
        totalUsers: 18,
      },
      {
        date: "2026-08-11",
        label: "Aug 11",
        runs: 6,
        activeUsers: 5,
        totalUsers: 21,
      },
    ];

    expect(buildActorMetricDisplayPoints(points, "cumulative", true)).toMatchObject([
      { displayRuns: 4, displayActiveUsers: 3, displayTotalUsers: 18 },
      { displayRuns: 10, displayActiveUsers: 8, displayTotalUsers: 21 },
    ]);
    expect(buildActorMetricDisplayPoints(points, "cumulative", false)[1]).toMatchObject({
      displayRuns: 6,
      displayActiveUsers: 8,
      displayTotalUsers: 21,
    });
  });
});
