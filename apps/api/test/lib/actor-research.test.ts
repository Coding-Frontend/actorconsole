import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("@actorconsole/db", async () => {
  const { Prisma } = await import("@prisma/client");
  return { Prisma, db: { $queryRaw: queryRaw } };
});
vi.mock("../../src/lib/public-cache.js", () => ({ publicCache: (load: unknown) => load }));

import { getActorResearch, researchFilters } from "../../src/lib/actor-research.js";
import { encodeApiData } from "@actorconsole/shared/api-data";

describe("Actor research raw SQL metrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns numeric growth and JSON-serializable data for MariaDB BIGINT expressions", async () => {
    queryRaw.mockResolvedValueOnce([{
      id: "actor-1", username: "clockworks", actorName: "tiktok-scraper",
      totalUsers: 100, baselineUsers: 88, newUsers: 12n,
      runs30Days: 100, users30Days: 10, pricingInfos: '[]',
    }]).mockResolvedValueOnce([{ total: 1n }]);
    const result = await getActorResearch(researchFilters({ sort: "trending" }));
    expect(result.total).toBe(1);
    expect(result.actors[0].newUsers).toBe(12);
    expect(() => JSON.stringify(encodeApiData(result))).not.toThrow();
  });

  it("preserves unavailable history and actual zero growth", async () => {
    queryRaw.mockResolvedValueOnce([
      { newUsers: null, pricingInfos: null, runs30Days: null, users30Days: null },
      { newUsers: 0n, pricingInfos: null, runs30Days: null, users30Days: null },
    ]).mockResolvedValueOnce([{ total: 2n }]);
    const result = await getActorResearch(researchFilters({}));
    expect(result.actors.map(actor => actor.newUsers)).toEqual([null, 0]);
    expect(() => JSON.stringify(encodeApiData(result))).not.toThrow();
  });
});
