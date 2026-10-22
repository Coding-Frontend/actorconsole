import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSession } from "@actorconsole/shared";

const { profile, count, update, getClient, listMyActors, enqueue } = vi.hoisted(() => ({
  profile: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
  getClient: vi.fn(),
  listMyActors: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    businessProfile: { findFirst: profile, update },
    actor: { count },
  },
}));
vi.mock("@actorconsole/apify", () => ({ getUserApifyClient: getClient }));
vi.mock("../../src/lib/queue.js", () => ({ enqueue }));
import { assertPlanFeature, refreshWorkspacePlanUsage } from "../../src/lib/plan-access.js";

const session: UserSession = {
  userId: "u1",
  email: "builder@example.com",
  plan: "FREE",
  businessProfileId: "bp1",
};
const features = [
  "ai_copy",
  "pricing_recommendations",
  "pricing_management",
  "publishing",
  "usage_analytics",
  "workspace_operations",
] as const;

describe("workspace feature access", () => {
  it("refreshes Pro audience totals without applying Free limits", async () => {
    profile.mockResolvedValue({
      plan: "PRO",
      apifyActorCount: 646,
      apifyMonthlyUsers: null,
      planUsageCheckedAt: new Date(0),
    });
    listMyActors.mockResolvedValue([
      { id: "a1", stats: { totalUsers30Days: 700 } },
      { id: "a2", stats: { monthlyUsers: 400 } },
    ]);
    await expect(refreshWorkspacePlanUsage({ ...session, plan: "PRO" })).resolves.toMatchObject({
      plan: "PRO",
      monthlyUsers: 1100,
      monthlyUsersComplete: true,
      monthlyUserLimit: null,
      upgradeRequired: false,
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ apifyMonthlyUsers: 1100 }) }),
    );
  });
  it("queues missing compact-list statistics and retains the last reported count", async () => {
    profile.mockResolvedValue({
      plan: "PRO",
      apifyActorCount: 646,
      apifyMonthlyUsers: 8000,
      apifyMonthlyUsersComplete: true,
      planUsageCheckedAt: new Date(0),
    });
    listMyActors.mockResolvedValue([{ id: "a1", stats: null }]);
    await expect(refreshWorkspacePlanUsage({ ...session, plan: "PRO" })).resolves.toMatchObject({
      monthlyUsers: 8000,
    });
    expect(update.mock.calls[0][0].data).not.toHaveProperty("apifyMonthlyUsers");
    expect(enqueue).toHaveBeenCalledWith(
      "audience",
      { userId: "u1", businessProfileId: "bp1" },
      expect.objectContaining({
        attempts: 3,
        jobId: expect.stringMatching(/^workspace-audience-bp1-/),
      }),
    );
  });
  it("keeps Pro access and cached totals during an Apify outage", async () => {
    profile.mockResolvedValue({
      plan: "PRO",
      apifyActorCount: 646,
      apifyMonthlyUsers: 8000,
      planUsageCheckedAt: new Date(0),
    });
    listMyActors.mockRejectedValue(new Error("Apify unavailable"));
    await expect(refreshWorkspacePlanUsage({ ...session, plan: "PRO" })).resolves.toMatchObject({
      actorCount: 646,
      monthlyUsers: 8000,
      upgradeRequired: false,
    });
    expect(update).not.toHaveBeenCalled();
  });
  it("repairs missing Pro statistics even after a recent compact inventory import", async () => {
    profile.mockResolvedValue({
      plan: "PRO",
      apifyActorCount: 646,
      apifyMonthlyUsers: null,
      planUsageCheckedAt: new Date(),
    });
    listMyActors.mockResolvedValue([{ id: "a1", stats: null }]);
    await refreshWorkspacePlanUsage({ ...session, plan: "PRO" });
    expect(enqueue).toHaveBeenCalledWith(
      "audience",
      { userId: "u1", businessProfileId: "bp1" },
      expect.any(Object),
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 50,
      apifyMonthlyUsers: 500,
      planUsageCheckedAt: new Date(),
    });
    getClient.mockResolvedValue({ listMyActors });
    count.mockResolvedValue(50);
  });
  it.each(features)("allows %s at exactly both Free thresholds", async (feature) => {
    await expect(assertPlanFeature(session, feature)).resolves.toBeUndefined();
  });
  it.each(features)("requires Pro for %s above the actor threshold", async (feature) => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 51,
      apifyMonthlyUsers: 1,
      planUsageCheckedAt: new Date(),
    });
    await expect(assertPlanFeature(session, feature)).rejects.toMatchObject({
      code: "plan_usage_limit_exceeded",
      status: 403,
    });
  });
  it.each(features)("requires Pro for %s above the audience threshold", async (feature) => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 1,
      apifyMonthlyUsers: 501,
      planUsageCheckedAt: new Date(),
    });
    await expect(assertPlanFeature(session, feature)).rejects.toMatchObject({
      code: "plan_usage_limit_exceeded",
      status: 403,
    });
  });
  it("keeps Pro workflows available without a Free eligibility lookup", async () => {
    await assertPlanFeature({ ...session, plan: "PRO" }, "ai_copy");
    expect(profile).not.toHaveBeenCalled();
  });
  it("keeps research and MCP setup available while an upgrade is required", async () => {
    for (const feature of ["keyword_research", "keyword_watchlist", "mcp_access"] as const)
      await assertPlanFeature(session, feature);
    expect(profile).not.toHaveBeenCalled();
  });
  it("falls back to the workspace actor count before the first usage refresh", async () => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: null,
      apifyMonthlyUsers: null,
      planUsageCheckedAt: new Date(),
    });
    count.mockResolvedValue(51);
    await expect(assertPlanFeature(session, "ai_copy")).rejects.toMatchObject({
      code: "plan_usage_limit_exceeded",
    });
    expect(count).toHaveBeenCalledWith({
      where: { businessProfileId: "bp1", userId: "u1", apifyRemovedAt: null },
    });
  });
  it("allows MCP credentials in an empty workspace before connecting Apify", async () => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: null,
      apifyMonthlyUsers: null,
      planUsageCheckedAt: null,
    });
    getClient.mockResolvedValue(null);
    count.mockResolvedValue(0);
    await expect(assertPlanFeature(session, "mcp_access")).resolves.toBeUndefined();
  });
  it("requires an owned workspace", async () => {
    profile.mockResolvedValue(null);
    await expect(assertPlanFeature(session, "ai_copy")).rejects.toMatchObject({
      code: "workspace_required",
    });
  });
  it("does not erase an existing restriction after Apify disconnects", async () => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 51,
      apifyMonthlyUsers: 10,
      planUsageCheckedAt: new Date(0),
    });
    getClient.mockResolvedValue(null);
    count.mockResolvedValue(0);
    await expect(assertPlanFeature(session, "workspace_operations")).rejects.toMatchObject({
      code: "plan_usage_limit_exceeded",
    });
    expect(update).not.toHaveBeenCalled();
  });
  it("restores operations when a refreshed inventory falls back within Free limits", async () => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 51,
      apifyMonthlyUsers: 501,
      planUsageCheckedAt: new Date(0),
    });
    listMyActors.mockResolvedValue([{ stats: { totalUsers30Days: 500 } }]);
    await expect(assertPlanFeature(session, "workspace_operations")).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ apifyActorCount: 1, apifyMonthlyUsers: 500 }),
      }),
    );
  });
  it("refreshes stale metrics before accepting an operational action", async () => {
    profile.mockResolvedValue({
      plan: "FREE",
      apifyActorCount: 1,
      apifyMonthlyUsers: 100,
      planUsageCheckedAt: new Date(0),
    });
    listMyActors.mockResolvedValue([{ stats: { totalUsers30Days: 501 } }]);
    await expect(assertPlanFeature(session, "ai_copy")).rejects.toMatchObject({
      code: "plan_usage_limit_exceeded",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ apifyMonthlyUsers: 501 }) }),
    );
  });
});
