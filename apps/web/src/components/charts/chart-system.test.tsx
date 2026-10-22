import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChartFrame, formatChartValue } from "./chart-system";

const series = [
  {
    key: "revenue",
    label: "Revenue USD",
    color: "#70d994",
    format: { unit: "currency" as const, currency: "USD" },
  },
  {
    key: "profit",
    label: "Net profit USD",
    color: "#78a9ff",
    format: { unit: "currency" as const, currency: "USD" },
  },
] as const;

afterEach(cleanup);

function TestChart() {
  return (
    <ChartFrame ariaLabel="Revenue test chart" series={series}>
      {({ visibleSeries, axisLabelsVisible, dataLabelsVisible }) => (
        <output data-testid="chart-state">
          {JSON.stringify({
            visibleSeries: [...visibleSeries],
            axisLabelsVisible,
            dataLabelsVisible,
          })}
        </output>
      )}
    </ChartFrame>
  );
}

describe("ChartFrame", () => {
  it("toggles series, focuses one series, and restores all series", () => {
    render(<TestChart />);

    expect(screen.getByTestId("chart-state").textContent).toContain("revenue");
    expect(screen.getByTestId("chart-state").textContent).toContain("profit");

    fireEvent.click(screen.getByRole("button", { name: "Toggle Revenue USD" }));
    expect(screen.getByTestId("chart-state").textContent).not.toContain("revenue");
    expect(screen.getByRole("button", { name: "Restore all chart series" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show only Net profit USD" }));
    expect(screen.getByTestId("chart-state").textContent).toContain('"visibleSeries":["profit"]');

    fireEvent.click(screen.getByRole("button", { name: "Restore all chart series" }));
    expect(screen.getByTestId("chart-state").textContent).toContain("revenue");
    expect(screen.getByTestId("chart-state").textContent).toContain("profit");
  });

  it("keeps axis and data labels independently controllable", () => {
    render(<TestChart />);
    fireEvent.click(screen.getByText("Chart options"));

    fireEvent.click(screen.getByRole("switch", { name: "Show axis labels" }));
    expect(screen.getByTestId("chart-state").textContent).toContain('"axisLabelsVisible":false');
    expect(screen.getByTestId("chart-state").textContent).toContain('"dataLabelsVisible":false');

    fireEvent.click(screen.getByRole("switch", { name: "Show data labels" }));
    expect(screen.getByTestId("chart-state").textContent).toContain('"dataLabelsVisible":true');
  });
});

describe("formatChartValue", () => {
  it("formats negative, currency, percent, compact, and missing values consistently", () => {
    expect(formatChartValue(-12.5, { unit: "currency", currency: "USD" })).toBe("-$12.50");
    expect(formatChartValue(12.5, { unit: "percent" })).toBe("12.5%");
    expect(formatChartValue(12_500, { unit: "compact" })).toBe("12.5K");
    expect(formatChartValue(null, { unit: "currency", currency: "USD" })).toBe("—");
  });
});
