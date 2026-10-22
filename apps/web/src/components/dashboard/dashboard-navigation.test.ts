import { describe, expect, it } from "vitest";
import {
  accountNavigation,
  dashboardNavigation,
  navigationItemActive,
  visibleDashboardNavigation,
  activeNavigationGroup,
} from "./dashboard-navigation";

describe("dashboard navigation", () => {
  it.each([
    ["SEO audit", "/dashboard/tools/seo"],
    ["Pricing calculator", "/dashboard/tools/pricing"],
  ])("keeps %s in the dashboard and marks it active", (label, href) => {
    const item = visibleDashboardNavigation(true)
      .flatMap((group) => group.items)
      .find((entry) => entry.label === label)!;
    expect(item.href).toBe(href);
    expect(item.external).not.toBe(true);
    expect(navigationItemActive(href, item)).toBe(true);
    expect(activeNavigationGroup(href)?.label).toBe("Research");
  });
  it("keeps only research, connections, and help for a restricted workspace", () => {
    expect(
      visibleDashboardNavigation(true).flatMap((group) => group.items.map((item) => item.label)),
    ).toEqual([
      "Keyword research",
      "Actor discovery",
      "Watchlist",
      "SEO audit",
      "Pricing calculator",
      "Apify connection",
      "MCP access",
      "Support",
      "Documentation",
    ]);
    expect(visibleDashboardNavigation(true).some((group) => group.label === "Operations")).toBe(
      false,
    );
    expect(visibleDashboardNavigation(false)).toEqual(dashboardNavigation);
  });
  it("keeps workspace selection in the topbar instead of adding a sidebar destination", () => {
    const labels = dashboardNavigation.flatMap((group) => group.items.map((item) => item.label));
    expect(labels).not.toContain("Workspaces");
    expect(labels).not.toContain("Leaderboard");
    expect(labels).not.toContain("Notifications");
    expect(labels).toEqual(
      expect.arrayContaining([
        "Actors",
        "Publishing",
        "Usage",
        "Costs",
        "Revenue",
        "Apify connection",
        "MCP access",
      ]),
    );
    expect(labels).not.toContain("Schedules");
    expect(dashboardNavigation.map((group) => group.label)).toEqual([
      "Workspace",
      "Research",
      "Operations",
      "Developer",
      "Help",
    ]);
  });

  it("exposes account destinations as first-class pages", () => {
    expect(accountNavigation.map((item) => item.label)).toEqual([
      "Profile",
      "Notification preferences",
      "Billing",
      "Payment history",
      "Data export",
      "Account deletion",
    ]);
  });

  it("marks payment history independently from billing", () => {
    const billing = accountNavigation.find((item) => item.id === "account-billing")!;
    const history = accountNavigation.find((item) => item.id === "account-payments")!;
    expect(navigationItemActive("/dashboard/billing/history", billing)).toBe(false);
    expect(navigationItemActive("/dashboard/billing/history", history)).toBe(true);
  });

  it("marks each developer page independently", () => {
    const connection = dashboardNavigation
      .flatMap((group) => group.items)
      .find((item) => item.label === "Apify connection")!;
    expect(navigationItemActive("/dashboard/apify", connection)).toBe(true);
    expect(navigationItemActive("/dashboard/api-keys", connection)).toBe(false);
  });

  it("uses one developer destination for MCP setup and credentials", () => {
    const developer = dashboardNavigation.find((group) => group.label === "Developer")!;
    expect(developer.items.map((item) => item.label)).toEqual(["Apify connection", "MCP access"]);
    expect(developer.items.find((item) => item.label === "MCP access")).toMatchObject({
      href: "/dashboard/mcp",
      statusKey: "expiredApiKeys",
    });
  });
});
