import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams("from=2026-09-01&to=2026-09-03&actor=actor-2"),
  downloadCsv: vi.fn(),
  request: vi.fn(),
  refresh: vi.fn(),
  data: {} as Record<string, unknown>,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.params,
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("./research-tools", () => ({ downloadCsv: mocks.downloadCsv }));
vi.mock("./workspace-data", () => ({
  fieldClass: "",
  WorkspaceState: () => null,
  PagePagination: () => null,
  intelligenceRequest: (...args: unknown[]) => mocks.request(...args),
  useIntelligence: (path: string) => ({
    data: mocks.data[path.split("?")[0]!],
    loading: false,
    error: "",
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/components/dashboard/dashboard-workbench", () => ({
  DashboardPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
import { Profitability } from "./profitability";

const row = {
  id: "actor-1",
  title: "Test Actor",
  actorName: "test",
  revenueUsd: 30,
  platformCostUsd: 12,
  externalCostUsd: 10,
  profitRevenueUsd: 10,
  profitPlatformCostUsd: 4,
  profitExternalCostUsd: 3,
  unmatchedExternalCostUsd: 7,
  unmatchedExpenses: 1,
  profitUsd: 3,
  margin: 30,
  revenueDays: 2,
  costDays: 2,
  matchedDays: 1,
  days: 3,
  complete: false,
  recordedExpenses: 2,
  coveredDates: ["2026-09-01"],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = {
    "/profitability": {
      items: [row],
      from: "2026-09-01",
      to: "2026-09-03",
      coverage: "Coverage explanation",
    },
    "/actors": [
      { id: "actor-1", title: "Test Actor" },
      { id: "actor-2", title: "Second Actor" },
    ],
    "/costs": {
      items: [],
      total: 0,
      totalUsd: 0,
      page: 1,
      pageSize: 50,
      coverage: "Recorded expenses only",
    },
  };
  mocks.request.mockResolvedValue({});
});
afterEach(cleanup);

describe("profitability workspace", () => {
  it("shows aligned amounts, partial profit and expenses on other days", () => {
    render(<Profitability />);
    const cells = within(
      screen.getByRole("link", { name: "Test Actor" }).closest("tr")!,
    ).getAllByRole("cell");
    expect(cells[0]!.textContent).toBe("$10.00");
    expect(cells[1]!.textContent).toBe("$4.00");
    expect(cells[2]!.textContent).toContain("$3.00");
    expect(cells[2]!.textContent).toContain("$7.00 on other days; see ledger");
    expect(cells[3]!.textContent).toBe("$3.00Partial profit");
    expect(cells[4]!.textContent).toBe("30.0%");
    expect(cells[5]!.textContent).toContain("Matched 1/3 days");
  });
  it("exports reported totals, matching amounts, status and actual covered dates", () => {
    render(<Profitability />);
    fireEvent.click(screen.getByRole("button", { name: "Export profitability" }));
    const table = mocks.downloadCsv.mock.calls[0]![1] as unknown[][];
    expect(table[0]!.length).toBe(table[1]!.length);
    const result = Object.fromEntries(table[0]!.map((header, index) => [header, table[1]![index]]));
    expect(result).toMatchObject({
      "Revenue USD (recorded)": 30,
      "Comparable revenue USD": 10,
      "Expenses outside comparable days USD": 7,
      "Profit USD (comparable days)": 3,
      "Coverage status": "Partial",
      "Covered UTC dates": "2026-09-01",
      "Margin %": 30,
    });
  });
  it("shows negative profit and explains undefined margin at zero revenue", () => {
    mocks.data["/profitability"] = {
      items: [
        {
          ...row,
          profitRevenueUsd: 0,
          profitUsd: -7,
          margin: null,
          matchedDays: 3,
          complete: true,
        },
      ],
      from: "2026-09-01",
      to: "2026-09-03",
    };
    render(<Profitability />);
    expect(screen.getByText("-$7.00")).toBeTruthy();
    expect(screen.getByText("N/A · zero revenue")).toBeTruthy();
    expect(screen.queryByText("Partial profit")).toBeNull();
  });
  it("keeps unmatched financials reported-only without inventing profit", () => {
    mocks.data["/profitability"] = {
      items: [{ ...row, matchedDays: 0, profitUsd: null, margin: null, coveredDates: [] }],
      from: "2026-09-01",
      to: "2026-09-03",
    };
    render(<Profitability />);
    expect(screen.getByText("No comparable days")).toBeTruthy();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText("$30.00")).toBeTruthy();
    expect(screen.queryByText("Partial profit")).toBeNull();
  });
  it("preserves micro-dollar expenses and labels ledger dates in UTC", () => {
    mocks.data["/costs"] = {
      items: [
        {
          id: "expense",
          source: "AI",
          amountUsd: "0.000001",
          incurredAt: "2026-09-01T23:30:00Z",
          actor: { title: "Test Actor" },
        },
      ],
      total: 1,
      totalUsd: 0.000001,
      page: 1,
      pageSize: 50,
    };
    render(<Profitability />);
    expect(screen.getByText("$0.000001")).toBeTruthy();
    expect(screen.getByText(/11:30:00 PM UTC/)).toBeTruthy();
  });
  it("records an expense for the selected Actor, refreshes reports and resets fields", async () => {
    render(<Profitability />);
    expect(
      (screen.getByLabelText("Actor", { selector: "#expense-actor" }) as HTMLSelectElement).value,
    ).toBe("actor-2");
    fireEvent.change(screen.getByLabelText("Service or source"), { target: { value: " Proxy " } });
    fireEvent.change(screen.getByLabelText("Amount (USD)"), { target: { value: "0.000001" } });
    fireEvent.change(screen.getByLabelText("Expense date (UTC)"), {
      target: { value: "2026-09-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record expense" }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith("/actors/actor-2/costs", "POST", {
        source: "Proxy",
        amountUsd: 0.000001,
        incurredAt: "2026-09-02T00:00:00.000Z",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText("Amount (USD)") as HTMLInputElement).value).toBe("");
  });
});
