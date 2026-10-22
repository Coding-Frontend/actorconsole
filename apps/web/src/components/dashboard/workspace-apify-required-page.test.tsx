import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/server-api", () => ({
  authenticatedServerFetch: (...args: unknown[]) => mocks.fetch(...args),
}));
vi.mock("@/components/dashboard/financial-analytics-page", () => ({
  FinancialAnalyticsPage: () => <div>Workspace analytics</div>,
}));
vi.mock("@/components/dashboard/usage-account-data-refresher", () => ({
  UsageAccountDataRefresher: () => null,
}));
vi.mock("@/components/dashboard/usage-sync-button", () => ({ UsageSyncButton: () => null }));
vi.mock("@/components/dashboard/bulk-publishing-workspace", () => ({
  BulkPublishingWorkspace: () => <div>Mounted publishing workspace</div>,
}));
vi.mock("@/components/dashboard/bulk-publishing-schedules", () => ({
  BulkPublishingSchedules: () => <div>Mounted publishing schedules</div>,
}));
vi.mock("@/components/dashboard/bulk-publishing-new-schedule", () => ({
  BulkPublishingNewSchedule: () => <div>Mounted new schedule</div>,
}));
vi.mock("@/components/dashboard/dashboard-workbench", () => ({
  DashboardPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/intelligence/profitability", () => ({
  Profitability: () => <div>Mounted profitability</div>,
}));
import UsagePage from "../../app/(dashboard)/dashboard/usage/page";
import CostsPage from "../../app/(dashboard)/dashboard/costs/page";
import RevenuePage from "../../app/(dashboard)/dashboard/revenue/page";
import ProfitabilityPage from "../../app/(dashboard)/dashboard/profitability/page";
import PublishingPage from "../../app/(dashboard)/dashboard/publishing/page";
import PublishingSchedulesPage from "../../app/(dashboard)/dashboard/publishing/schedules/page";
import NewPublishingSchedulePage from "../../app/(dashboard)/dashboard/publishing/schedules/new/page";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);
describe("analytics before connecting Apify", () => {
  it("shows Apify connection setup before loading profitability", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ data: { connected: false } })));
    render(await ProfitabilityPage());
    expect(screen.getByRole("link", { name: "Connect Apify" }).getAttribute("href")).toBe(
      "/dashboard/apify",
    );
    expect(screen.queryByText("Mounted profitability")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it.each([
    ["Usage", UsagePage],
    ["Costs", CostsPage],
    ["Revenue", RevenuePage],
  ] as const)("renders %s setup before fetching analytics", async (title, Page) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ data: { connected: false } })));
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect Apify" }).getAttribute("href")).toBe(
      "/dashboard/apify",
    );
    expect(screen.getByRole("button", { name: "How to connect Apify" })).toBeTruthy();
    expect(screen.queryByText("Workspace analytics")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith("/apify/status");
  });

  it("does not present Console-only credentials as an API connection", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { connected: true, apiKeyConfigured: false, cookiesConfigured: true },
        }),
      ),
    );
    render(await UsagePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Add API key" })).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("loads analytics for a working API-only connection", async () => {
    mocks.fetch.mockImplementation(
      async (path: string) =>
        new Response(
          JSON.stringify({
            data:
              path === "/apify/status"
                ? { connected: true, apiKeyConfigured: true, apiOperationsAvailable: true }
                : { latestSyncAt: null },
          }),
        ),
    );
    render(await UsagePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Workspace analytics")).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledWith("/actors/usage");
  });

  it("handles a status outage without claiming the account is disconnected", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    render(await CostsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Could not check the Apify connection")).toBeTruthy();
    expect(screen.queryByText(/has no Apify account/)).toBeNull();
  });

  it("shows connection setup throughout publishing without mounting operations", async () => {
    mocks.fetch.mockImplementation(
      async () => new Response(JSON.stringify({ data: { connected: false } })),
    );
    for (const load of [
      () => PublishingPage(),
      () => PublishingSchedulesPage({ searchParams: Promise.resolve({}) }),
      () => NewPublishingSchedulePage(),
    ]) {
      const view = render(await load());
      expect(screen.getByRole("link", { name: "Connect Apify" })).toBeTruthy();
      expect(screen.queryByText("Mounted publishing workspace")).toBeNull();
      expect(screen.queryByText("Mounted publishing schedules")).toBeNull();
      expect(screen.queryByText("Mounted new schedule")).toBeNull();
      view.unmount();
    }
    expect(mocks.fetch.mock.calls.every(([path]) => path === "/apify/status")).toBe(true);
  });
});
