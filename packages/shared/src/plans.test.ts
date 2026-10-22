import { describe, expect, it } from "vitest";
import {
  actorLimitForPlan,
  planHasFeature,
  workspacePlanUsage,
  workspacePlanNotice,
} from "./plans.js";

describe("actorLimitForPlan", () => {
  it("keeps the Free workspace limit", () => {
    expect(actorLimitForPlan("FREE")).toBe(50);
  });

  it("treats Pro workspaces as unlimited", () => {
    expect(actorLimitForPlan("PRO")).toBeNull();
  });

  it("falls back to the Free limit for an unknown plan", () => {
    expect(actorLimitForPlan("UNKNOWN")).toBe(50);
  });
});

describe("workspacePlanUsage", () => {
  it("includes AI, pricing, publishing, and MCP in Free", () => {
    for (const feature of [
      "ai_copy",
      "pricing_recommendations",
      "pricing_management",
      "publishing",
      "mcp_access",
    ] as const) {
      expect(planHasFeature("FREE", feature)).toBe(true);
    }
  });
  it.each([
    [50, 500, false],
    [51, 500, true],
    [50, 501, true],
    [51, 501, true],
  ])("Free with %i actors and %i monthly users requires upgrade: %s", (actors, users, required) =>
    expect(workspacePlanUsage("FREE", actors, users).upgradeRequired).toBe(required),
  );
  it("does not limit Pro by portfolio or audience", () => {
    expect(workspacePlanUsage("PRO", 1000, 100000)).toMatchObject({
      actorLimit: null,
      monthlyUserLimit: null,
      upgradeRequired: false,
    });
  });
  it("does not interpret missing audience data as exceeding the limit", () => {
    expect(workspacePlanUsage("FREE", 50, null).upgradeRequired).toBe(false);
  });
});

describe("workspacePlanNotice", () => {
  it.each([
    [39, 399, null],
    [40, 100, "near"],
    [5, 400, "near"],
    [50, 500, "near"],
    [51, 100, "exceeded"],
    [5, 501, "exceeded"],
  ])("warns without changing Free eligibility at %i actors / %i users", (actors, users, notice) => {
    const usage = workspacePlanUsage("FREE", actors, users);
    expect(workspacePlanNotice(usage)).toBe(notice);
    expect(usage.upgradeRequired).toBe(notice === "exceeded");
  });
  it("does not warn for unlimited Pro or invent missing user counts", () => {
    expect(workspacePlanNotice(workspacePlanUsage("PRO", 100, 1000))).toBeNull();
    expect(workspacePlanNotice(workspacePlanUsage("FREE", 5, null))).toBeNull();
  });
});
