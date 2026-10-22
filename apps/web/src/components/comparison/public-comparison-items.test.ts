import { describe, it, expect } from "vitest";
import { builderCompareItem } from "./public-comparison-items";
import { estimateActorEarnings, rollupEarnings } from "@actorconsole/shared/actor-earnings";
const builder = {
  username: "test",
  name: null,
  pictureUrl: null,
  actorCount: 1,
  newActorCount: 0,
  activeUsers: 100,
  totalUsers: 200,
  recentRuns: 1000,
  totalRuns: 2000,
  lastUpdatedAt: new Date("2026-10-03T00:00:00Z"),
  rank: 9,
};
const earnings = rollupEarnings([
  estimateActorEarnings({
    pricingInfos: [{ pricingModel: "PRICE_PER_DATASET_ITEM", pricePerUnitUsd: 0.005 }],
    runs30Days: 1000,
    users30Days: 100,
  }),
]);
describe("public comparison earnings", () => {
  it("does not present a revenue leaderboard position as an active-user rank", () => {
    const item = builderCompareItem({ ...builder, earnings }, 30, "estimated-revenue");
    expect(item.metrics.rank).toBeNull();
    expect(item.metrics.earningsRank).toBe(9);
    expect(item.metrics.earningsCentral).toBe(120);
  });
  it("keeps unavailable earnings and revenue rank unknown", () => {
    const item = builderCompareItem(builder);
    expect(item.metrics.rank).toBe(9);
    expect(item.metrics.earningsRank).toBeNull();
    expect(item.metrics.earningsCentral).toBeNull();
  });
});
