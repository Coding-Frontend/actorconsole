import { describe, expect, it } from "vitest";
import { actorOptimizationState, optimizationFingerprint } from "../../src/lib/actor-optimization-state.js";

const actor = {
  name: "example-scraper",
  title: " Example scraper ",
  description: " Extract product data ",
  readme: " # Example scraper ",
  inputSchema: { type: "object", properties: { url: { type: "string" } } },
  outputSchema: null,
  pictureUrl: "https://example.com/scraper.png",
  categories: ["developer tools"],
};

describe("Actor optimization stale-proposal checks", () => {
  it.each([actor.pictureUrl, null])("accepts an unchanged snapshot with image %s", (pictureUrl) => {
    const generatedState = actorOptimizationState({ ...actor, pictureUrl }, {});
    const storedFingerprint = optimizationFingerprint(JSON.parse(JSON.stringify(generatedState)));
    const applicationState = actorOptimizationState({ ...actor, pictureUrl }, {});

    expect(optimizationFingerprint(applicationState)).toBe(storedFingerprint);
    expect(generatedState.imageUrl).toBe(pictureUrl);
    expect(generatedState.categories).toEqual(["DEVELOPER_TOOLS"]);
  });

  it.each([
    { title: "A changed title" },
    { description: "A changed description" },
    { readme: "# Changed documentation" },
    { pictureUrl: "https://example.com/updated.png" },
    { inputSchema: { type: "object", properties: {} } },
  ])("still detects metadata changes before application: %j", (changes) => {
    const generated = optimizationFingerprint(actorOptimizationState(actor, {}));
    const current = optimizationFingerprint(actorOptimizationState({ ...actor, ...changes }, {}));

    expect(current).not.toBe(generated);
  });

  it("uses current Console pricing and categories consistently in both phases", () => {
    const basicInfo = {
      categories: ["ecommerce"],
      pricingInfos: [{
        pricingModel: "PAY_PER_EVENT" as const,
        pricingPerEvent: { actorChargeEvents: { result: { eventTitle: "Result", eventPriceUsd: 0.01 } } },
      }],
    };
    const generatedState = actorOptimizationState(actor, basicInfo);
    const changedPricing = {
      ...basicInfo,
      pricingInfos: [{
        ...basicInfo.pricingInfos[0],
        pricingPerEvent: { actorChargeEvents: { result: { eventTitle: "Result", eventPriceUsd: 0.02 } } },
      }],
    };

    expect(generatedState.categories).toEqual(["ECOMMERCE"]);
    expect(generatedState.pricing?.events.result.eventPriceUsd).toBe(0.01);
    expect(optimizationFingerprint(actorOptimizationState(actor, basicInfo))).toBe(optimizationFingerprint(generatedState));
    expect(optimizationFingerprint(actorOptimizationState(actor, changedPricing))).not.toBe(optimizationFingerprint(generatedState));
  });
});
