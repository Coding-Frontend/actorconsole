import { describe, expect, it } from "vitest";
import { calculateProfitability, profitabilityRange } from "../../src/lib/profitability.js";

const range = profitabilityRange("2026-09-01", "2026-09-03");
const snapshot = (day: string, revenueUsd: number | null, costUsd: number | null) => ({
  capturedOn: new Date(`${day}T00:00:00Z`),
  revenueUsd,
  costUsd,
});
const expense = (day: string, amountUsd: string) => ({
  incurredAt: new Date(`${day}T12:00:00Z`),
  amountUsd,
});

describe("profitability calculations", () => {
  it("calculates a covered-day subtotal instead of hiding partial profit", () => {
    const result = calculateProfitability(
      [
        snapshot("2026-09-01", 10, 4),
        snapshot("2026-09-02", 20, null),
        snapshot("2026-09-03", null, 8),
      ],
      [expense("2026-09-01", "3"), expense("2026-09-02", "7")],
      range,
    );
    expect(result).toMatchObject({
      revenueUsd: 30,
      platformCostUsd: 12,
      externalCostUsd: 10,
      profitRevenueUsd: 10,
      profitPlatformCostUsd: 4,
      profitExternalCostUsd: 3,
      unmatchedExternalCostUsd: 7,
      unmatchedExpenses: 1,
      profitUsd: 3,
      margin: 30,
      revenueDays: 2,
      costDays: 2,
      matchedDays: 1,
      complete: false,
      coveredDates: ["2026-09-01"],
    });
  });
  it("uses all days and expenses when the period is complete", () => {
    expect(
      calculateProfitability(
        [
          snapshot("2026-09-01", 10, 4),
          snapshot("2026-09-02", 20, 5),
          snapshot("2026-09-03", 0, 1),
        ],
        [expense("2026-09-01", "2")],
        range,
      ),
    ).toMatchObject({
      profitUsd: 18,
      margin: 60,
      complete: true,
      matchedDays: 3,
      unmatchedExternalCostUsd: 0,
    });
  });
  it("never compares revenue and cost on different days", () => {
    expect(
      calculateProfitability(
        [snapshot("2026-09-01", 10, null), snapshot("2026-09-02", null, 2)],
        [],
        range,
      ),
    ).toMatchObject({
      revenueUsd: 10,
      platformCostUsd: 2,
      matchedDays: 0,
      profitUsd: null,
      margin: null,
      complete: false,
    });
  });
  it("reports loss at zero revenue while leaving margin undefined", () => {
    expect(
      calculateProfitability([snapshot("2026-09-01", 0, 2)], [expense("2026-09-01", "1")], range),
    ).toMatchObject({ profitUsd: -3, margin: null });
    expect(calculateProfitability([snapshot("2026-09-01", 0, 0)], [], range)).toMatchObject({
      profitUsd: 0,
      margin: null,
      matchedDays: 1,
    });
  });
  it("preserves negative profit and micro-dollar precision without floating-point drift", () => {
    expect(
      calculateProfitability(
        [snapshot("2026-09-01", 0.3, 0.1)],
        [expense("2026-09-01", "0.2"), expense("2026-09-01", "0.000001")],
        range,
      ),
    ).toMatchObject({ profitUsd: -0.000001, externalCostUsd: 0.200001 });
  });
  it("keeps absent and non-finite financials unknown", () => {
    expect(
      calculateProfitability([snapshot("2026-09-01", NaN, Infinity)], [], range),
    ).toMatchObject({ revenueUsd: null, platformCostUsd: null, profitUsd: null });
    expect(calculateProfitability([], [expense("2026-09-01", "4")], range)).toMatchObject({
      externalCostUsd: 4,
      unmatchedExternalCostUsd: 4,
      profitUsd: null,
    });
  });
  it("does not substitute all-run cost into an incomplete paying-user financial record", () => {
    expect(
      calculateProfitability(
        [
          {
            ...snapshot("2026-09-01", 10, 8),
            monetization: { daily: { revenueUsd: 10, costUsd: null } },
          },
        ],
        [],
        range,
      ),
    ).toMatchObject({ costDays: 0, platformCostUsd: null, profitUsd: null });
  });
  it("uses one row per UTC day and excludes values outside the inclusive date range", () => {
    expect(
      calculateProfitability(
        [
          snapshot("2026-08-31", 50, 10),
          snapshot("2026-09-01", 10, 2),
          snapshot("2026-09-01", 12, 3),
          snapshot("2026-09-04", 60, 10),
        ],
        [expense("2026-08-31", "20"), expense("2026-09-04", "30")],
        range,
      ),
    ).toMatchObject({
      revenueUsd: 12,
      platformCostUsd: 3,
      profitUsd: 9,
      externalCostUsd: 0,
      matchedDays: 1,
      revenueDays: 1,
      costDays: 1,
    });
  });
});

describe("profitability UTC range", () => {
  it.each([
    ["2026-02-30", "2026-03-03"],
    ["2026-02-29", "2026-03-03"],
    ["2026-09-03", "2026-09-01"],
    ["invalid", "2026-09-01"],
    ["2026-01-01", "2027-01-02"],
    ["2026-9-1", "2026-09-01"],
  ])("rejects invalid or excessive dates %s through %s", (from, to) => {
    expect(() => profitabilityRange(from, to)).toThrow("Choose valid UTC dates");
  });
  it("includes both boundary dates, accepts a leap day, and defaults to 30 days", () => {
    expect(profitabilityRange("2024-01-01", "2024-12-31").days).toBe(366);
    expect(profitabilityRange("2024-02-29", "2024-02-29").days).toBe(1);
    expect(
      profitabilityRange(undefined, undefined, new Date("2026-10-04T18:00:00Z")),
    ).toMatchObject({
      from: "2026-09-05",
      to: "2026-10-04",
      days: 30,
      until: new Date("2026-10-05T00:00:00Z"),
    });
  });
});
