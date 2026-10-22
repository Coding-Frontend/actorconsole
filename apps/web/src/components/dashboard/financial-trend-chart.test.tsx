import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ download: vi.fn(), settings: vi.fn(), inspect: vi.fn() }));
vi.mock("@/components/intelligence/tool-actions", () => ({ downloadCsv: mocks.download }));
// Layout is exercised in a real browser. Give Recharts a fixed size in DOM tests.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const { cloneElement } = await import("react");
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: React.ReactElement<{ width: number; height: number }>;
    }) => cloneElement(children, { width: 800, height: 330 }),
  };
});
import {
  FinancialTrendChart,
  financialTrendPeriodLabel,
  formatFinancialTrendValue,
} from "./financial-trend-chart";

const points = [
  {
    period: "2026-08-10",
    runs: 5,
    successful: 4,
    failed: 1,
    directCostUsd: 0.000001,
    accountCostUsd: 0.15,
    revenueUsd: 4,
    netProfitUsd: -0.5,
  },
  {
    period: "2026-08-11",
    runs: 6,
    successful: 6,
    failed: 0,
    directCostUsd: null,
    accountCostUsd: null,
    revenueUsd: null,
    netProfitUsd: null,
  },
];
const props = {
  points,
  granularity: "day" as const,
  mode: "absolute" as const,
  compare: true,
  from: "2026-08-10",
  to: "2026-08-11",
  selectedDay: null,
  advancedCount: 0,
  onSettingsChange: mocks.settings,
  onInspectDay: mocks.inspect,
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function advanced() {
  fireEvent.click(screen.getByRole("button", { name: "Advanced chart settings" }));
}
function dataTable() {
  fireEvent.click(screen.getByText("View exact values"));
  return screen.getByRole("table");
}

describe("simple financial charts", () => {
  it.each([
    ["usage", "Total runs"],
    ["costs", "Account spending"],
    ["revenue", "Revenue and net profit"],
  ] as const)("starts %s with an obvious metric and keeps settings hidden", (kind, label) => {
    render(<FinancialTrendChart {...props} kind={kind} />);
    expect(
      (screen.getByRole("combobox", { name: "Chart metric" }) as HTMLSelectElement)
        .selectedOptions[0]!.textContent,
    ).toBe(label);
    expect(screen.queryByRole("combobox", { name: "Group results by" })).toBeNull();
    expect(screen.queryByText("Chart options")).toBeNull();
    expect(screen.queryByRole("button", { name: /Show only/ })).toBeNull();
  });
  it("switches the preset, legend, table and export together without changing scope", () => {
    render(<FinancialTrendChart {...props} kind="revenue" />);
    fireEvent.change(screen.getByRole("combobox", { name: "Chart metric" }), {
      target: { value: "2" },
    });
    expect(
      within(screen.getByRole("list", { name: "Displayed metrics" })).getAllByRole("listitem"),
    ).toHaveLength(1);
    const table = dataTable();
    expect(within(table).queryByRole("columnheader", { name: "Revenue (USD)" })).toBeNull();
    expect(within(table).getByText("-$0.50")).toBeTruthy();
    expect(within(table).getByText("Unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download chart data" }));
    expect(mocks.download).toHaveBeenCalledWith("revenue-chart.csv", [
      ["Period (UTC)", "Value type", "Net profit (USD)"],
      ["2026-08-10", "Period total", -0.5],
      ["2026-08-11", "Period total", null],
    ]);
    expect(mocks.settings).not.toHaveBeenCalled();
  });
  it("retains custom metrics in advanced settings and prevents hiding every metric", () => {
    render(<FinancialTrendChart {...props} kind="usage" />);
    advanced();
    expect(
      (screen.getByRole("checkbox", { name: "Total runs" }) as HTMLInputElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Successful runs" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Total runs" }));
    expect(
      (screen.getByRole("checkbox", { name: "Successful runs" }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("combobox", { name: "Chart metric" }) as HTMLSelectElement).value,
    ).toBe("custom");
    expect(
      within(screen.getByRole("list", { name: "Displayed metrics" })).getByText("Successful runs"),
    ).toBeTruthy();
  });
  it("keeps date grouping, running totals, comparison and inspection functional", () => {
    render(<FinancialTrendChart {...props} kind="costs" />);
    advanced();
    fireEvent.change(screen.getByRole("combobox", { name: "Group results by" }), {
      target: { value: "week" },
    });
    expect(mocks.settings).toHaveBeenLastCalledWith({ granularity: "week", day: null });
    fireEvent.change(screen.getByLabelText("Chart values"), { target: { value: "cumulative" } });
    expect(mocks.settings).toHaveBeenLastCalledWith({ mode: "cumulative" });
    fireEvent.click(screen.getByRole("switch", { name: "Compare summaries with previous period" }));
    expect(mocks.settings).toHaveBeenLastCalledWith({ compare: "false" });
    fireEvent.change(screen.getByLabelText("Inspect one UTC date"), {
      target: { value: "2026-08-11" },
    });
    expect(mocks.inspect).toHaveBeenLastCalledWith("2026-08-11");
  });
  it("restores chart defaults without changing Actors or the date range", () => {
    render(<FinancialTrendChart {...props} kind="costs" granularity="week" mode="cumulative" />);
    fireEvent.change(screen.getByRole("combobox", { name: "Chart metric" }), {
      target: { value: "2" },
    });
    advanced();
    fireEvent.change(screen.getByLabelText("Chart style"), { target: { value: "line" } });
    fireEvent.click(screen.getByRole("switch", { name: "Show values on the chart" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset chart settings" }));
    expect(
      (screen.getByRole("combobox", { name: "Chart metric" }) as HTMLSelectElement).value,
    ).toBe("0");
    expect(mocks.settings).toHaveBeenLastCalledWith({
      granularity: null,
      mode: null,
      compare: null,
      day: null,
      table: null,
    });
    expect((screen.getByLabelText("Chart style") as HTMLSelectElement).value).toBe("bar");
    expect(
      screen.getByRole("switch", { name: "Show values on the chart" }).getAttribute("aria-checked"),
    ).toBe("false");
  });
  it("keeps crowded labels off while preserving all exact values", () => {
    render(
      <FinancialTrendChart
        {...props}
        kind="usage"
        points={Array.from({ length: 30 }, (_, i) => ({
          ...points[0]!,
          period: `2026-08-${String(i + 1).padStart(2, "0")}`,
        }))}
      />,
    );
    advanced();
    expect(
      (screen.getByRole("switch", { name: "Show values on the chart" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const table = dataTable();
    expect(within(table).getAllByRole("row")).toHaveLength(31);
  });
  it("shows a metric-specific empty state rather than an empty plot", () => {
    render(
      <FinancialTrendChart
        {...props}
        kind="costs"
        points={[{ period: "2026-08-10", accountCostUsd: null }]}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Missing values are not zero");
    expect(within(dataTable()).getByText("Unavailable")).toBeTruthy();
  });
  it("explains overlapping costs and preserves micro-dollar precision", () => {
    render(<FinancialTrendChart {...props} kind="costs" />);
    fireEvent.change(screen.getByRole("combobox", { name: "Chart metric" }), {
      target: { value: "2" },
    });
    expect(screen.getByText(/do not add them together/)).toBeTruthy();
    expect(within(dataTable()).getByText("$0.000001")).toBeTruthy();
  });
});

describe("financial chart reading", () => {
  it("formats exact values and preserves zero, loss and missing data", () => {
    expect(formatFinancialTrendValue(12345, "usage")).toBe("12,345");
    expect(formatFinancialTrendValue(0, "costs")).toBe("$0.00");
    expect(formatFinancialTrendValue(-0.000001, "revenue")).toBe("-$0.000001");
    expect(formatFinancialTrendValue(0.0000001, "costs")).toBe("<$0.000001");
    expect(formatFinancialTrendValue(null, "costs")).toBe("Unavailable");
  });
  it("uses readable UTC dates, including the year in exact readings", () => {
    expect(financialTrendPeriodLabel("2026-08-10", "day", true)).toBe("Aug 10, 2026");
    expect(financialTrendPeriodLabel("2026-08-10", "week", true)).toBe("Week of Aug 10, 2026");
    expect(financialTrendPeriodLabel("2026-08", "month", true)).toBe("Aug 2026");
  });
});
