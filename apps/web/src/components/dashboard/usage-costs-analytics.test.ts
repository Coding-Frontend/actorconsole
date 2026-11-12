import { describe, expect, it } from "vitest";
import { resolveCurrentServiceEntries, type UsageCostsPayload } from "./usage-costs-analytics";

describe("usage cost Actor breakdown", () => {
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
