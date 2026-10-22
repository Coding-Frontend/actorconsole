import { describe, expect, it } from "vitest";
import { actorPricingSchema } from "./pricing.js";

describe("actorPricingSchema", () => {
  it("accepts a pay-per-event configuration with at least one charge event", () => {
    const result = actorPricingSchema.safeParse({
      model: "PAY_PER_EVENT",
      events: {
        scrape: {
          eventPriceUsd: 0.5,
          eventTitle: "Scrape event",
        },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBeNull();
  });

  it("accepts multiple events with one primary and a one-time Actor start event", () => {
    expect(
      actorPricingSchema.safeParse({
        model: "PAY_PER_EVENT",
        events: {
          "apify-actor-start": {
            eventPriceUsd: 0.001,
            eventTitle: "Actor start",
            isOneTimeEvent: true,
          },
          "apify-default-dataset-item": {
            eventPriceUsd: 0.00199,
            eventTitle: "Result",
            isPrimaryEvent: true,
          },
        },
      }).success,
    ).toBe(true);
  });

  it("rejects more than one primary event", () => {
    expect(
      actorPricingSchema.safeParse({
        model: "PAY_PER_EVENT",
        events: {
          result: { eventPriceUsd: 0.001, eventTitle: "Result", isPrimaryEvent: true },
          enriched: { eventPriceUsd: 0.01, eventTitle: "Enriched", isPrimaryEvent: true },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects legacy pricing models and empty event maps", () => {
    expect(
      actorPricingSchema.safeParse({
        model: "PRICE_PER_DATASET_ITEM",
        amount: 0.01,
        events: {},
      }).success,
    ).toBe(false);

    expect(actorPricingSchema.safeParse({ model: "PAY_PER_EVENT", events: {} }).success).toBe(
      false,
    );
  });
});
