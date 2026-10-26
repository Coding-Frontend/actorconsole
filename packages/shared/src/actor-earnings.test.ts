import { describe, expect, it } from "vitest";
import { estimateActorEarnings, rollupEarnings } from "./actor-earnings";
const ppr = { pricingModel: "PRICE_PER_DATASET_ITEM", pricePerUnitUsd: 0.005, unitName: "result" };
const estimate = (
  pricingInfos: unknown,
  runs30Days: number | null = 1000,
  users30Days: number | null = 100,
) =>
  estimateActorEarnings({
    pricingInfos,
    runs30Days,
    users30Days,
    now: Date.parse("2026-10-03T00:00:00Z"),
  });
describe("public earnings scenarios", () => {
  it("applies stated paying, unit and creator-share assumptions to monthly runs only", () => {
    expect(estimate([ppr])).toMatchObject({
      lowUsd: 4,
      centralUsd: 120,
      highUsd: 2800,
      status: "estimated",
      basis: "runs",
    });
  });
  it("does not invent zero revenue for missing prices or rolling usage", () => {
    expect(estimate(null).centralUsd).toBeNull();
    expect(estimate([ppr], null).centralUsd).toBeNull();
    expect(estimate([ppr], 0).centralUsd).toBe(0);
  });
  it("keeps genuinely free developer fees distinct from unavailable pricing", () => {
    expect(estimate([{ pricingModel: "FREE" }], null, null).status).toBe("free");
    expect(estimate([{ pricingModel: "UNKNOWN" }]).status).toBe("unavailable");
  });
  it("uses current pricing and refuses future-only and expired configurations", () => {
    expect(estimate([{ ...ppr, startedAt: "2026-10-04" }]).status).toBe("unavailable");
    expect(estimate([{ ...ppr, endedAt: "2026-10-02" }]).status).toBe("unavailable");
    expect(
      estimate(JSON.stringify([ppr, { ...ppr, pricePerUnitUsd: 1, startedAt: "2026-10-04" }]))
        .centralUsd,
    ).toBe(120);
  });
  it("prices primary result events and known start charges without counting all events as results", () => {
    const result = estimate([
      {
        pricingModel: "PAY_PER_EVENT",
        pricingPerEvent: {
          actorChargeEvents: {
            result: { isPrimaryEvent: true, eventPriceUsd: 0.005 },
            "apify-actor-start": { eventPriceUsd: 0.1 },
            other: { eventPriceUsd: 99 },
          },
        },
      },
    ]);
    expect(result.centralUsd).toBe(144);
    expect(result.startPriceUsd).toBe(0.1);
  });
  it("treats the Apify start event once per paying run and supports tiered published prices", () => {
    const value = estimate([
      {
        pricingModel: "PAY_PER_EVENT",
        pricingPerEvent: {
          actorChargeEvents: {
            "apify-actor-start": {
              isPrimaryEvent: true,
              eventTieredPricingUsd: { FREE: { tieredEventPriceUsd: 1 } },
            },
          },
        },
      },
    ]);
    expect(value.centralUsd).toBe(240);
    expect(value.unitsPerRun).toEqual([1, 1, 1]);
  });
  it("does not multiply a monthly access pass by millions of runs", () => {
    const value = estimate(
      [
        {
          pricingModel: "PAY_PER_EVENT",
          pricingPerEvent: {
            actorChargeEvents: {
              "monthly-access-pass": {
                isPrimaryEvent: true,
                isOneTimeEvent: true,
                eventTitle: "monthly pass",
                eventPriceUsd: 79,
              },
            },
          },
        },
      ],
      3_100_401,
      39,
    );
    expect(value).toMatchObject({
      status: "unavailable",
      lowUsd: null,
      centralUsd: null,
      highUsd: null,
    });
    expect(value.reason).toContain("charge count");
    expect(rollupEarnings([value])).toMatchObject({ coveredActors: 0, centralUsd: null });
  });
  it("requires a primary event and does not declare mixed paid events free", () => {
    expect(
      estimate([
        {
          pricingModel: "PAY_PER_EVENT",
          pricingPerEvent: {
            actorChargeEvents: { a: { eventPriceUsd: 1 }, b: { eventPriceUsd: 2 } },
          },
        },
      ]).status,
    ).toBe("unavailable");
    expect(
      estimate([
        {
          pricingModel: "PAY_PER_EVENT",
          pricingPerEvent: {
            actorChargeEvents: {
              a: { isPrimaryEvent: true, eventPriceUsd: 0 },
              b: { eventPriceUsd: 2 },
            },
          },
        },
      ]).status,
    ).toBe("unavailable");
  });
  it("uses monthly users for rental, with paying conversion explicit", () => {
    const pricingInfos = [{ pricingModel: "FLAT_PRICE_PER_MONTH", pricePerUnitUsd: 10 }];
    expect(
      estimateActorEarnings({
        pricingInfos,
        runs30Days: null,
        users30Days: 100,
        now: Date.parse("2026-09-30"),
      }),
    ).toMatchObject({ basis: "users", lowUsd: 80, centralUsd: 240, highUsd: 560 });
    expect(estimate(pricingInfos).status).toBe("unavailable");
  });
  it("rejects invalid prices, currencies and overflow", () => {
    for (const price of [-1, NaN, Infinity])
      expect(estimate([{ ...ppr, pricePerUnitUsd: price }]).status).toBe("unavailable");
    expect(estimate([{ ...ppr, currency: "EUR" }]).status).toBe("unavailable");
    expect(estimate([{ ...ppr, pricePerUnitUsd: 1e308 }], 1e308).status).toBe("unavailable");
  });
  it("rolls up only covered Actors; computes per-Actor means and preserves uncertainty order", () => {
    const value = rollupEarnings([
      estimate([ppr]),
      estimate([{ pricingModel: "FREE" }]),
      estimate(null),
    ]);
    expect(value).toMatchObject({
      totalActors: 3,
      coveredActors: 2,
      unavailableActors: 1,
      lowUsd: 4,
      centralUsd: 120,
      highUsd: 2800,
      minimumActorUsd: 0,
      averageActorUsd: 60,
      maximumActorUsd: 120,
    });
    expect(rollupEarnings([estimate(null)]).centralUsd).toBeNull();
    expect(rollupEarnings([]).averageActorUsd).toBeNull();
  });
});
