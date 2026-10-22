import { describe, expect, it } from "vitest";
import { annualSavings, monthlyEquivalent, type ProOffer } from "./pro-billing-offers";

const offers: ProOffer[] = [
  {
    gateway: { key: "dodo", name: "Dodo", mode: "live" },
    option: { interval: "month", currency: "USD", amountMinor: 1900 },
  },
  {
    gateway: { key: "stripe", name: "Stripe", mode: "live" },
    option: { interval: "year", currency: "USD", amountMinor: 19900 },
  },
];

describe("subscription price comparisons", () => {
  it("never rounds savings up beyond the actual discount", () => {
    expect(annualSavings(offers)).toBe(12);
    expect(monthlyEquivalent(offers[1].option)).toBe("$16.58");
  });
  it.each(["currency", "mode", "missing", "higher", "zero"])(
    "does not invent savings for %s prices",
    (kind) => {
      const next = structuredClone(offers);
      if (kind === "currency") next[1].option.currency = "INR";
      if (kind === "mode") next[1].gateway.mode = "test";
      if (kind === "missing") delete next[0].option.amountMinor;
      if (kind === "higher") next[1].option.amountMinor = 30000;
      if (kind === "zero") next[0].option.amountMinor = 0;
      expect(annualSavings(next)).toBe(0);
    },
  );
  it("formats zero-decimal and three-decimal currencies correctly", () => {
    expect(monthlyEquivalent({ interval: "year", currency: "JPY", amountMinor: 12000 })).toMatch(/¥1,000$/);
    expect(monthlyEquivalent({ interval: "year", currency: "KWD", amountMinor: 12000 })).toMatch(
      /1\.000/,
    );
  });
});
