import { describe, expect, it, vi } from "vitest";
import { earningsMoney } from "./earnings-summary";

describe("earnings formatting", () => {
  it("preserves currency precision and compact thresholds", () => {
    const values = [
      null,
      undefined,
      0,
      -0.005,
      0.000001,
      0.009999,
      0.01,
      999.99,
      1000,
      9999,
      10000,
      1_000_000,
    ];
    for (const compact of [false, true]) {
      for (const value of values) {
        const expected =
          value == null
            ? "Unavailable"
            : new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
                ...(value >= (compact ? 1000 : 10000)
                  ? { notation: "compact" as const, maximumFractionDigits: 1 }
                  : {}),
              }).format(value);
        expect(earningsMoney(value, compact)).toBe(expected);
      }
    }
  });

  it("reuses formatters across a portfolio of Actor earnings", () => {
    const constructor = vi.spyOn(Intl, "NumberFormat");
    try {
      for (let actor = 0; actor < 24; actor++) {
        for (const value of [0.0001, 250, 10_000]) earningsMoney(value, true);
      }
      expect(constructor).not.toHaveBeenCalled();
    } finally {
      constructor.mockRestore();
    }
  });
});
