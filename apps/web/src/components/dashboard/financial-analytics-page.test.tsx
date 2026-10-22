import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UsageCostsPayload } from "./usage-costs-analytics";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/revenue",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ theme: "dark" }) }));
import {
  aggregateFinancialLedger,
  dailyFinancialLedgerRows,
  FinancialAnalyticsPage,
  financialChartDay,
  financialDateKey,
  financialWeekKey,
  usagePeriodRows,
  weeklyFinancialLedgerRows,
} from "./financial-analytics-page";
import { PageDataPendingContext } from "@/lib/page-data-state";

const baseRow = {
  actorId: "actor-1",
  apifyActorId: "apify-1",
  title: "Maps Actor",
  actorName: "maps-actor",
  username: "builder",
  revenueUsd: 4,
  profitUsd: 3,
  netProfitUsd: 2.5,
  margin: 62.5,
  runs: 5,
  results: 100,
  activeUsers: 2,
  costSource: "run-data" as const,
  capturedAt: "2026-08-10T12:00:00.000Z",
};

describe("financial Actor-day presentation", () => {
  afterEach(() => {
    cleanup();
    navigation.replace.mockReset();
    navigation.search = "";
  });

  it("aggregates Actor-day values while preserving unavailable allocated cost", () => {
    const rows = aggregateFinancialLedger([
      {
        ...baseRow,
        date: "2026-08-10",
        directCostUsd: 1,
        allocatedCostUsd: 1.5,
      },
      {
        ...baseRow,
        date: "2026-08-11",
        directCostUsd: 2,
        allocatedCostUsd: null,
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        actorId: "actor-1",
        runs: 10,
        results: 200,
        directCostUsd: 3,
        allocatedCostUsd: null,
        revenueUsd: 8,
        netProfitUsd: 5,
      }),
    ]);
  });

  it("keeps one row per Actor and UTC day for daily tables", () => {
    const rows = dailyFinancialLedgerRows([
      {
        ...baseRow,
        date: "2026-08-10",
        directCostUsd: 1,
        allocatedCostUsd: 1.5,
      },
      {
        ...baseRow,
        date: "2026-08-11",
        directCostUsd: 2,
        allocatedCostUsd: 2.5,
      },
    ]);

    expect(rows.map((row) => row.key)).toEqual(["actor-1:2026-08-10", "actor-1:2026-08-11"]);
  });

  it("normalizes financial timestamps to their UTC day", () => {
    expect(financialDateKey("2026-08-10T23:30:00.000Z")).toBe("2026-08-10");
    expect(financialWeekKey("2026-08-09")).toBe("2026-08-03");
    expect(financialWeekKey("2026-08-10")).toBe("2026-08-10");
  });

  it("groups usage and financial rows into Monday-based UTC weeks", () => {
    const payload = analyticsPayload();
    payload.items[0]!.usageDaily.push({
      date: "2026-08-11T00:00:00.000Z",
      usageCostUsd: 2,
      runs: 3,
      successfulRuns: 2,
      failedRuns: 1,
      resultCount: 40,
    });
    expect(usagePeriodRows(payload.items, "2026-08-10", "2026-08-16", "weekly")).toEqual([
      expect.objectContaining({
        date: "2026-08-10",
        runs: 8,
        successfulRuns: 6,
        failedRuns: 2,
        results: 140,
      }),
    ]);

    expect(
      weeklyFinancialLedgerRows([
        { ...baseRow, date: "2026-08-10", directCostUsd: 1, allocatedCostUsd: 1.5 },
        { ...baseRow, date: "2026-08-11", directCostUsd: 2, allocatedCostUsd: 2.5 },
      ]),
    ).toEqual([
      expect.objectContaining({
        date: "2026-08-10",
        directCostUsd: 3,
        allocatedCostUsd: 4,
        revenueUsd: 8,
        runs: 10,
      }),
    ]);
  });

  it("resolves a UTC day from Recharts chart and bar click payloads", () => {
    expect(financialChartDay({ activePayload: [{ payload: { period: "2026-08-10" } }] })).toBe(
      "2026-08-10",
    );
    expect(financialChartDay({ payload: { period: "2026-08-11" } })).toBe("2026-08-11");
    expect(financialChartDay({ period: "2026-08" })).toBeNull();
  });

  it("renders cost comparisons, service categories, and unavailable coverage honestly", () => {
    render(<FinancialAnalyticsPage kind="costs" payload={analyticsPayload()} />);

    expect(screen.getByText("Previous-period spend")).toBeTruthy();
    expect(screen.getByText("Current billing-cycle service categories")).toBeTruthy();
    expect(screen.getAllByText("Spend share").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.getByText("Actors")).toBeTruthy();
    expect(screen.getByText("Period")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Advanced chart settings" }));
    expect(screen.getByText("Group by")).toBeTruthy();
    expect(screen.getByText("Chart values")).toBeTruthy();
  });

  it("renders the complete revenue table and stores a selected UTC day separately", () => {
    render(<FinancialAnalyticsPage kind="revenue" payload={analyticsPayload()} />);

    expect(screen.getByText("Revenue by Actor")).toBeTruthy();
    expect(screen.getAllByText("Active users").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+2 vs previous").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Daily" })).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: /Maps Actor/ })
        .every((link) => link.getAttribute("target") === "_blank"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Advanced chart settings" }));
    fireEvent.change(screen.getByLabelText("Inspect one UTC date"), {
      target: { value: "2026-08-10" },
    });
    expect(navigation.replace).toHaveBeenCalledWith("/dashboard/revenue?day=2026-08-10", {
      scroll: false,
    });
  });

  it("keeps the contextual daily table for cost drill-downs", () => {
    render(<FinancialAnalyticsPage kind="costs" payload={analyticsPayload()} />);

    fireEvent.click(screen.getByRole("button", { name: "Advanced chart settings" }));
    fireEvent.change(screen.getByLabelText("Inspect one UTC date"), {
      target: { value: "2026-08-10" },
    });
    expect(navigation.replace).toHaveBeenCalledWith(
      "/dashboard/revenue?day=2026-08-10&table=daily",
      { scroll: false },
    );
  });

  it("offers daily and weekly Actor usage tables and a specific-day drill-down", () => {
    render(<FinancialAnalyticsPage kind="usage" payload={analyticsPayload()} />);

    expect(screen.getByRole("button", { name: "Range totals" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    expect(navigation.replace).toHaveBeenCalledWith("/dashboard/revenue?table=daily", {
      scroll: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Weekly" }));
    expect(navigation.replace).toHaveBeenCalledWith("/dashboard/revenue?table=weekly", {
      scroll: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Advanced chart settings" }));
    fireEvent.change(screen.getByLabelText("Inspect one UTC date"), {
      target: { value: "2026-08-10" },
    });
    expect(navigation.replace).toHaveBeenCalledWith("/dashboard/revenue?day=2026-08-10", {
      scroll: false,
    });
  });

  it("renders a selected revenue day as a contextual Actor breakdown without a daily ledger", () => {
    const payload = analyticsPayload();
    payload.filters!.day = "2026-08-10";
    render(<FinancialAnalyticsPage kind="revenue" payload={payload} />);

    expect(screen.getByText("Actor revenue on 2026-08-10")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Daily" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Date" })).toBeNull();
  });

  it("keeps the actor picker open and combines rapid selections before the payload arrives", async () => {
    const payload = analyticsPayload();
    payload.items.push({
      ...payload.items[0]!,
      id: "actor-2",
      title: "Search Actor",
      actorName: "search-actor",
    });
    const page = () => (
      <PageDataPendingContext.Provider value={Boolean(navigation.search)}>
        <FinancialAnalyticsPage kind="revenue" payload={payload} />
      </PageDataPendingContext.Provider>
    );
    const view = render(page());
    fireEvent.click(screen.getByRole("button", { name: "Actor filter" }));
    const input = screen.getByPlaceholderText("Find an Actor");
    fireEvent.click(screen.getByRole("button", { name: "Maps Actor builder/maps-actor" }));
    navigation.search = "?actors=actor-1";
    view.rerender(page());
    expect(screen.getByPlaceholderText("Find an Actor")).toBe(input);
    expect(screen.getByText("1 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search Actor builder/search-actor" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/dashboard/revenue?actors=actor-1%2Cactor-2",
      { scroll: false },
    );
    navigation.search = "?actors=actor-1%2Cactor-2";
    view.rerender(page());
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    navigation.search = "?compare=false";
    view.rerender(page());
    expect(screen.getByText("0 selected")).toBeTruthy();
  });
});

function analyticsPayload(): UsageCostsPayload {
  return {
    items: [
      {
        id: "actor-1",
        apifyActorId: "apify-1",
        title: "Maps Actor",
        actorName: "maps-actor",
        username: "builder",
        lastRunSyncAt: "2026-08-11T12:00:00.000Z",
        usageDaily: [
          {
            date: "2026-08-10T00:00:00.000Z",
            usageCostUsd: 1,
            runs: 5,
            successfulRuns: 4,
            failedRuns: 1,
            resultCount: 100,
          },
        ],
      },
    ],
    latestSyncAt: "2026-08-11T12:00:00.000Z",
    accountUsage: {
      syncedAt: "2026-08-11T12:00:00.000Z",
      monthly: null,
      actors: { current: null, previous: null },
      calendarMonth: {
        dailyServiceUsage: {
          "2026-08-10": [
            {
              quantity: 2,
              baseUnitPriceUsd: 0.5,
              baseAmountUsd: 1,
              amountAfterVolumeDiscountUsd: 1,
            },
          ],
        },
        monthlyServiceUsage: {
          actorComputeUnits: {
            quantity: 2,
            baseUnitPriceUsd: 0.5,
            baseAmountUsd: 1,
            amountAfterVolumeDiscountUsd: 1,
          },
        },
      },
      currentServices: null,
      currentPeriod: {
        usage: {
          usageCycle: {
            startAt: "2026-08-01T00:00:00.000Z",
            endAt: "2026-09-01T00:00:00.000Z",
          },
          monthlyServiceUsage: {},
          dailyServiceUsages: [],
          totalUsageCreditsUsdBeforeVolumeDiscount: 1,
          totalUsageCreditsUsdAfterVolumeDiscount: 1,
        },
        limits: null,
      },
      unavailable: 0,
      credentialIssue: null,
    },
    filters: {
      from: "2026-08-01",
      to: "2026-08-30",
      previousFrom: "2026-07-02",
      previousTo: "2026-07-31",
      actorIds: [],
      granularity: "day",
      mode: "absolute",
      day: null,
      timeZone: "UTC",
    },
    report: {
      granularity: "day",
      mode: "absolute",
      points: [
        {
          period: "2026-08-10",
          usageCostUsd: 1,
          allocatedCostUsd: 1.5,
          revenueUsd: 4,
          profitUsd: 3,
          netProfitUsd: 2.5,
          runs: 5,
          successfulRuns: 4,
          failedRuns: 1,
        },
      ],
    },
    revenue: {
      syncedAt: "2026-08-11T12:00:00.000Z",
      daily: [],
      monthly: [],
      actors: [
        {
          id: "actor-1",
          apifyActorId: "apify-1",
          title: "Maps Actor",
          actorName: "maps-actor",
          username: "builder",
          costUsd: 1,
          allocatedCostUsd: 1.5,
          revenueUsd: 4,
          profitUsd: 3,
          netProfitUsd: 2.5,
          margin: 62.5,
          runs: 5,
          results: 100,
          activeUsers: 2,
          previousRevenueUsd: 2,
          previousNetProfitUsd: 1,
          previousRuns: 3,
          previousResults: 60,
          costAvailable: false,
          allocatedCostAvailable: false,
          actorDays: 2,
          costCoveredDays: 1,
          allocatedCoveredDays: 0,
          revenueCoveredDays: 2,
          activeUsersCoveredDays: 2,
        },
      ],
      ledger: [
        {
          ...baseRow,
          date: "2026-08-10",
          directCostUsd: null,
          allocatedCostUsd: null,
        },
      ],
      ledgerTotal: 1,
      ledgerTruncated: false,
      comparison: {
        current: {
          costUsd: 1,
          allocatedCostUsd: 1.5,
          revenueUsd: 4,
          profitUsd: 3,
          netProfitUsd: 2.5,
          runs: 5,
          results: 100,
          activeUsers: 2,
          costCoveredDays: 0,
          allocatedCoveredDays: 0,
        },
        previous: {
          costUsd: 0.5,
          allocatedCostUsd: 0.75,
          revenueUsd: 2,
          profitUsd: 1.5,
          netProfitUsd: 1,
          runs: 3,
          results: 60,
          activeUsers: 1,
          costCoveredDays: 1,
          allocatedCoveredDays: 1,
        },
      },
      coverage: {
        workspaceActors: 1,
        selectedActors: 1,
        actorsWithRevenue: 1,
        rows: 1,
        costCoveredRows: 0,
        allocatedCostCoveredRows: 0,
        failedActorSyncs: 0,
        officialCurrentMonthCoveredActors: 1,
      },
      unavailableActors: 0,
    },
  };
}
