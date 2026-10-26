import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));

import {
  BUILDER_METRICS,
  buildDailyPortfolioTrends,
  effectiveActorPicture,
  newlyPublishedWhere,
} from "./builders";

describe("builder leaderboard metrics", () => {
  it("exposes every requested leaderboard filter", () => {
    expect(BUILDER_METRICS.map((metric) => metric.value)).toEqual([
      "new-actors",
      "actors",
      "monthly-users",
      "total-users",
      "monthly-runs",
      "total-runs",
      "estimated-revenue",
    ]);
  });

  it("prefers an Actor thumbnail, then website logo, then initials fallback", () => {
    expect(
      effectiveActorPicture({
        actorPictureUrl: "https://images.apify.com/a.png",
        websiteLogoId: "logo-1",
      }),
    ).toEqual({
      effectivePictureUrl: "https://images.apify.com/a.png",
      pictureSource: "actor",
    });
    expect(effectiveActorPicture({ actorPictureUrl: null, websiteLogoId: "logo-1" })).toEqual({
      effectivePictureUrl: "/api/website-logo-assets/logo-1",
      pictureSource: "website",
    });
    expect(effectiveActorPicture({ actorPictureUrl: null, websiteLogoId: null })).toEqual({
      effectivePictureUrl: null,
      pictureSource: "fallback",
    });
  });

  it("uses only publication time, never upload or discovery dates", () => {
    const start = new Date("2026-07-16T00:00:00.000Z");
    const end = new Date("2026-08-15T00:00:00.000Z");

    expect(newlyPublishedWhere(start, end)).toEqual({
      firstPublishedAt: { gte: start, lt: end },
    });
  });

  it("charts a complete historical portfolio using the actors known on that day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
    try {
      const trends = buildDailyPortfolioTrends(
        [
          {
            storeActorId: "actor-a",
            capturedAt: new Date("2026-08-08T01:00:00.000Z"),
            users30Days: 10,
            runs30Days: 20,
          },
          {
            storeActorId: "actor-a",
            capturedAt: new Date("2026-08-14T01:00:00.000Z"),
            users30Days: 12,
            runs30Days: 22,
          },
          {
            storeActorId: "actor-b",
            capturedAt: new Date("2026-08-14T01:00:00.000Z"),
            users30Days: 15,
            runs30Days: 25,
          },
          {
            storeActorId: "actor-a",
            capturedAt: new Date("2026-08-15T01:00:00.000Z"),
            users30Days: 14,
            runs30Days: 28,
          },
          {
            storeActorId: "actor-b",
            capturedAt: new Date("2026-08-15T01:00:00.000Z"),
            users30Days: 17,
            runs30Days: 25,
          },
        ],
        30,
        [
          { storeActorId: "actor-a", firstSeenAt: new Date("2026-08-08T01:00:00.000Z") },
          { storeActorId: "actor-b", firstSeenAt: new Date("2026-08-14T01:00:00.000Z") },
        ],
      );

      expect(trends.find((point) => point.date === "2026-08-08")).toMatchObject({
        observed: true,
        users: 10,
        runs: 20,
      });
      expect(trends.find((point) => point.date === "2026-08-14")).toMatchObject({
        observed: true,
        users: 27,
        runs: 47,
      });
      expect(trends.find((point) => point.date === "2026-08-15")).toMatchObject({
        observed: true,
        users: 31,
        runs: 53,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mark an incomplete current-day catalog as captured", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    try {
      const trends = buildDailyPortfolioTrends(
        [
          {
            storeActorId: "actor-a",
            capturedAt: new Date("2026-08-15T01:00:00.000Z"),
            users30Days: 61,
            runs30Days: 966,
          },
        ],
        7,
        [
          { storeActorId: "actor-a", firstSeenAt: new Date("2026-08-10T01:00:00.000Z") },
          { storeActorId: "actor-b", firstSeenAt: new Date("2026-08-10T01:00:00.000Z") },
        ],
        { currentDayComplete: false },
      );

      expect(trends.find((point) => point.date === "2026-08-15")).toMatchObject({
        observed: false,
        users: null,
        runs: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts the current-day snapshot only after the full catalog completes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    try {
      const trends = buildDailyPortfolioTrends(
        [
          {
            storeActorId: "actor-a",
            capturedAt: new Date("2026-08-15T01:00:00.000Z"),
            users30Days: 61,
            runs30Days: 966,
          },
          {
            storeActorId: "actor-b",
            capturedAt: new Date("2026-08-15T01:00:00.000Z"),
            users30Days: 167,
            runs30Days: 3_550,
          },
        ],
        7,
        [
          { storeActorId: "actor-a", firstSeenAt: new Date("2026-08-10T01:00:00.000Z") },
          { storeActorId: "actor-b", firstSeenAt: new Date("2026-08-10T01:00:00.000Z") },
        ],
        { currentDayComplete: true },
      );

      expect(trends.find((point) => point.date === "2026-08-15")).toMatchObject({
        observed: true,
        users: 228,
        runs: 4_516,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
