import { beforeEach, describe, expect, it, vi } from "vitest";

const { profile, update, count, getClient, listMyActors } = vi.hoisted(() => ({
  profile: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
  getClient: vi.fn(),
  listMyActors: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    businessProfile: { findFirst: profile, update },
    actor: { count },
  },
}));
vi.mock("@actorconsole/apify", async () => ({
  getUserApifyClient: getClient,
  collectWorkspaceAudience: (await import("../../../../packages/apify/src/workspace-audience.js"))
    .collectWorkspaceAudience,
}));
import { assertWorkspacePlanAccess } from "../../src/lib/plan-access.js";

describe("queued workspace workflow eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 50,
      apifyMonthlyUsers: 500,
      planUsageCheckedAt: new Date(),
    });
    getClient.mockResolvedValue({ listMyActors });
    listMyActors.mockResolvedValue([]);
  });
  it("allows Free jobs at both limits", async () => {
    await expect(assertWorkspacePlanAccess("u1", "bp1")).resolves.toBeUndefined();
    expect(getClient).not.toHaveBeenCalled();
  });
  it.each([
    [51, 500],
    [50, 501],
  ])("blocks queued jobs with %i actors and %i users", async (actors, users) => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: actors,
      apifyMonthlyUsers: users,
      planUsageCheckedAt: new Date(),
    });
    await expect(assertWorkspacePlanAccess("u1", "bp1")).rejects.toThrow("Upgrade to Pro");
  });
  it("refreshes stale usage and notices audience growth without dashboard activity", async () => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 2,
      apifyMonthlyUsers: 100,
      planUsageCheckedAt: new Date(0),
    });
    listMyActors.mockResolvedValue([
      { id: "a1", stats: { totalUsers30Days: 300 } },
      { id: "a2", stats: { monthlyUsers: 201 } },
    ]);
    await expect(assertWorkspacePlanAccess("u1", "bp1")).rejects.toThrow("Upgrade to Pro");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ apifyActorCount: 2, apifyMonthlyUsers: 501 }),
      }),
    );
  });
  it("allows Pro jobs above both Free thresholds", async () => {
    profile.mockResolvedValue({ plan: "PRO", apifyActorCount: 100, apifyMonthlyUsers: 10000 });
    await expect(assertWorkspacePlanAccess("u1", "bp1")).resolves.toBeUndefined();
    expect(getClient).not.toHaveBeenCalled();
  });
  it("does not execute workflows when stale usage cannot be verified", async () => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 2,
      apifyMonthlyUsers: 100,
      planUsageCheckedAt: null,
    });
    getClient.mockResolvedValue(null);
    await expect(assertWorkspacePlanAccess("u1", "bp1")).rejects.toThrow("verify workspace usage");
  });
});
