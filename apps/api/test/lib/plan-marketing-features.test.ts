import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockConfigFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockConfigFindMany: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  db: {
    planMarketingFeature: {
      findMany: mockFindMany,
    },
    planMarketingFeatureConfig: {
      findMany: mockConfigFindMany,
    },
  },
}));

import { getPlanMarketingFeatures } from "../../src/lib/plan-marketing-features.js";

describe("getPlanMarketingFeatures", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockConfigFindMany.mockResolvedValue([]);
  });

  it("groups enabled database rows by plan", async () => {
    mockFindMany.mockResolvedValue([
      { plan: "FREE", label: "Tracked Actor", enabled: true, sortOrder: 0, createdAt: new Date() },
      { plan: "FREE", label: "Disabled row", enabled: false, sortOrder: 1, createdAt: new Date() },
      {
        plan: "PRO",
        label: "Priority support",
        enabled: true,
        sortOrder: 0,
        createdAt: new Date(),
      },
    ]);

    await expect(getPlanMarketingFeatures()).resolves.toEqual({
      FREE: ["Tracked Actor"],
      PRO: ["Priority support"],
    });
  });

  it("preserves an intentionally empty customized plan", async () => {
    mockFindMany.mockResolvedValue([]);
    mockConfigFindMany.mockResolvedValue([{ plan: "FREE" }]);

    await expect(getPlanMarketingFeatures()).resolves.toMatchObject({ FREE: [] });
  });

  it("uses shared defaults while the migration is unavailable", async () => {
    mockFindMany.mockRejectedValue(new Error("table does not exist"));

    const result = await getPlanMarketingFeatures();
    expect(result.FREE.length).toBeGreaterThan(0);
    expect(result.PRO.length).toBeGreaterThan(0);
  });
});
