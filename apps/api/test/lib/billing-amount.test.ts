import { describe, expect, it } from "vitest";
import { providerAmount } from "../../src/lib/billing-amount.js";
describe("provider currency and minor units", () => {
  it.each([
    ["INR", 12345, 123.45],
    ["usd", 12345, 123.45],
    ["JPY", 12345, 12345],
    ["KWD", 12345, 12.345],
  ])("reads %s amounts from provider metadata", (currency, amount, expected) => {
    expect(providerAmount(amount, currency)).toEqual({
      currency: currency.toUpperCase(),
      amount: expected,
    });
  });
  it.each([
    [1, undefined],
    [-1, "INR"],
    [1.25, "USD"],
    [NaN, "USD"],
    [Number.MAX_SAFE_INTEGER + 1, "USD"],
    [1, "US"],
  ])("rejects missing/invalid provider money metadata %s %s", (amount, currency) => {
    expect(() => providerAmount(amount, currency)).toThrow("invalid amount or currency");
  });
});
