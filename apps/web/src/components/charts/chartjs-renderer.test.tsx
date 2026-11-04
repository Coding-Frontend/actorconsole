import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartJsRenderer as ChartJsChart } from "./chartjs-renderer";
import { ChartFrame } from "./chart-system";
import { MockChart } from "../../../test/chartjs-mock";

vi.mock("chart.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("chart.js")>()),
  Chart: (await import("../../../test/chartjs-mock")).MockChart,
}));

const data = [
  { date: "2026-11-01", revenue: 0.000001, runs: 2 },
  { date: "2026-11-02", revenue: null, runs: 0 },
  { date: "2026-11-03", revenue: -0.5, runs: 3 },
];
const series = [
  {
    key: "revenue",
    label: "Revenue",
    color: "var(--color-signal-blue)",
    formatValue: (value: number) => `$${value.toFixed(6)}`,
  },
  { key: "runs", label: "Runs", color: "#f86606", axisId: "runs", type: "bar" as const },
];
const props = { ariaLabel: "Daily revenue and runs", data, series, xKey: "date" as const };

beforeEach(() => {
  MockChart.instances.length = 0;
});
afterEach(() => {
  cleanup();
  document.documentElement.className = "";
});

describe("Chart.js dashboard renderer", () => {
  it("preserves missing values, losses, micro-dollar precision, and separate count axes", () => {
    render(<ChartJsChart {...props} additionalAxes={{ runs: { hidden: true, integer: true } }} />);
    const chart = MockChart.instances[0]!;
    expect(chart.data.datasets[0]!.data).toEqual([0.000001, null, -0.5]);
    expect(chart.data.datasets[1]!.data).toEqual([2, 0, 3]);
    expect(chart.data.datasets[1]!.yAxisID).toBe("runs");
    expect(chart.options.scales?.runs?.display).toBe(false);
    expect(chart.options.animation).toBe(false);
    expect(chart.data.datasets[0]!.borderColor).not.toContain("var(");
  });

  it("reads exact and missing observations with the keyboard and selects with Enter", () => {
    const onSelect = vi.fn();
    render(<ChartJsChart {...props} onSelect={onSelect} />);
    const canvas = screen.getByRole("img", { name: props.ariaLabel });
    fireEvent.focus(canvas);
    expect(screen.getByText(/Revenue: \$0\.000001/)).toBeTruthy();
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(screen.getByText(/2026-11-02\. Revenue: Unavailable\. Runs: 0/)).toBeTruthy();
    fireEvent.keyDown(canvas, { key: "End" });
    expect(screen.getByText(/Revenue: \$-0\.500000/)).toBeTruthy();
    fireEvent.keyDown(canvas, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(2);
    fireEvent.keyDown(canvas, { key: "Home" });
    expect(screen.getByText(/2026-11-01\. Revenue:/)).toBeTruthy();
  });

  it("updates chart controls in place and restores the canvas after all series are hidden", () => {
    render(
      <ChartFrame ariaLabel="Dashboard chart" series={series}>
        {(state) => <ChartJsChart {...props} state={state} />}
      </ChartFrame>,
    );
    const chart = MockChart.instances[0]!;
    fireEvent.click(screen.getByRole("button", { name: "Toggle Revenue" }));
    expect(chart.data.datasets[0]!.hidden).toBe(true);
    expect(chart.data.datasets[1]!.hidden).toBe(false);
    expect(MockChart.instances).toHaveLength(1);
    fireEvent.click(screen.getByText("Chart options"));
    fireEvent.click(screen.getByRole("switch", { name: "Show axis labels" }));
    expect(chart.options.scales?.x?.display).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Runs" }));
    expect(screen.getByRole("status").textContent).toContain("Select at least one series");
    expect(chart.destroy).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Restore all chart series" }));
    expect(screen.getByRole("img", { name: props.ariaLabel })).toBeTruthy();
    expect(MockChart.instances).toHaveLength(2);
  });

  it("refreshes theme colors and destroys every instance across Strict Mode remounts", async () => {
    const view = render(
      <StrictMode>
        <ChartJsChart {...props} />
      </StrictMode>,
    );
    const chart = MockChart.instances.at(-1)!;
    chart.update.mockClear();
    document.documentElement.classList.add("dark");
    await waitFor(() => expect(chart.update).toHaveBeenCalledWith("none"));
    view.unmount();
    expect(MockChart.instances.every((instance) => instance.destroy.mock.calls.length === 1)).toBe(
      true,
    );
  });
});
