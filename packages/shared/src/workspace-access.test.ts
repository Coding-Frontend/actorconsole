import { describe, expect, it } from "vitest";
import { isRestrictedDashboardPath, isRestrictedWorkspaceApiPath } from "./workspace-access";

describe("workspace access routes", () => {
  it.each([
    "",
    "/actors",
    "/actors/a1",
    "/activity",
    "/publishing",
    "/usage",
    "/costs",
    "/revenue",
  ])("restricts dashboard%s", (path) => {
    expect(isRestrictedDashboardPath(`/dashboard${path}`)).toBe(true);
  });
  it.each([
    "/default",
    "/keywords",
    "/keywords/search",
    "/tools/pricing",
    "/tools/seo",
    "/mcp",
    "/apify",
    "/support",
    "/support/t1",
    "/billing",
    "/onboarding",
    "/profile",
    "/data-export",
    "/account",
    "/upgrade",
  ])("keeps %s available", (path) => {
    expect(isRestrictedDashboardPath(`/dashboard${path}`)).toBe(false);
  });
  it("matches route segments rather than similar prefixes", () => {
    expect(isRestrictedDashboardPath("/dashboard/tools/pricing-private")).toBe(true);
    expect(isRestrictedDashboardPath("/dashboard/tools/other")).toBe(true);
    expect(isRestrictedDashboardPath("/dashboard/keywords-private")).toBe(true);
    expect(isRestrictedDashboardPath("/dashboard-other")).toBe(false);
    expect(isRestrictedDashboardPath("/docs")).toBe(false);
  });
  it.each([
    "/actors",
    "/actors/",
    "/actors/a1/usage",
    "/actors/plan-usage/child",
    "/bulk-publishing/queue",
    "/account/dashboard-summary",
    "/apify/operations",
  ])("restricts API %s", (path) => {
    expect(isRestrictedWorkspaceApiPath(path)).toBe(true);
  });
  it.each([
    "/actors/plan-usage",
    "/account/default-dashboard",
    "/actors/plan-usage/",
    "/account/api-key-actors",
    "/account/workspace-access",
    "/keywords/search",
    "/mcp/info",
    "/mcp/usage",
    "/apify/connect",
    "/apify/status",
    "/billing/checkout",
  ])("keeps API %s available", (path) => {
    expect(isRestrictedWorkspaceApiPath(path)).toBe(false);
  });
});
