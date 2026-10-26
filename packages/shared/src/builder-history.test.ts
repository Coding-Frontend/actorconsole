import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDailyPortfolioTrends } from "./builder-history";

afterEach(() => vi.useRealTimers());
describe("historical builder membership", () => {
  it("retains available runs with explicit coverage instead of hiding the portfolio", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const trend = buildDailyPortfolioTrends(
      [
        {
          storeActorId: "known",
          capturedAt: new Date("2026-10-25"),
          users30Days: 3,
          runs30Days: 12,
        },
        {
          storeActorId: "unknown",
          capturedAt: new Date("2026-10-25"),
          users30Days: 0,
          runs30Days: null,
        },
      ],
      7,
      ["known", "unknown"].map((storeActorId) => ({
        storeActorId,
        firstSeenAt: new Date("2026-10-01"),
      })),
    );
    expect(trend.find((point) => point.date === "2026-10-25")).toMatchObject({
      observed: true,
      users: 3,
      runs: 12,
      usersCoverage: { known: 2, total: 2 },
      runsCoverage: { known: 1, total: 2 },
    });
  });

  it("retains retired Actors on their observed days without carrying usage into later days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const trends = buildDailyPortfolioTrends(
      [
        {
          storeActorId: "retired",
          capturedAt: new Date("2026-10-05"),
          users30Days: 39,
          runs30Days: 3_100_401,
        },
      ],
      30,
      [
        {
          storeActorId: "retired",
          firstSeenAt: new Date("2026-08-08"),
          lastSeenAt: new Date("2026-10-05T18:00:00Z"),
        },
      ],
      { currentDayComplete: true },
    );
    expect(trends.find((point) => point.date === "2026-10-05")).toMatchObject({
      observed: true,
      users: 39,
      runs: 3_100_401,
    });
    expect(trends.find((point) => point.date === "2026-10-06")).toMatchObject({
      observed: false,
      users: null,
      runs: null,
    });
    expect(trends.at(-1)).toMatchObject({ observed: false, users: null });
  });

  it("changes membership across publication and retirement, while keeping incomplete days as gaps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const point = (storeActorId: string, day: number, users30Days: number | null) => ({
      storeActorId,
      capturedAt: new Date(`2026-10-${day}`),
      users30Days,
      runs30Days: 0,
    });
    const trends = buildDailyPortfolioTrends(
      [
        point("old", 20, 10),
        point("new", 20, 99),
        point("old", 21, 11),
        point("new", 21, 20),
        point("new", 22, 21),
        point("new", 23, null),
        point("new", 24, 0),
      ],
      7,
      [
        {
          storeActorId: "old",
          firstSeenAt: new Date("2026-10-01"),
          lastSeenAt: new Date("2026-10-22"),
        },
        {
          storeActorId: "new",
          firstSeenAt: new Date("2026-10-21"),
          lastSeenAt: new Date("2026-10-26"),
        },
      ],
    );
    expect(trends[0]).toMatchObject({ users: 10, observed: true });
    expect(trends[1]).toMatchObject({ users: 31, observed: true });
    expect(trends[2]).toMatchObject({ users: null, observed: false });
    expect(trends[3]).toMatchObject({ users: null, runs: 0 });
    expect(trends[4]).toMatchObject({ users: 0, observed: true });
  });
});
