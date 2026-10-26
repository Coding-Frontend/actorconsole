import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservedMetricBarChart } from "./observed-metric-bar-chart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

afterEach(cleanup);

describe("ObservedMetricBarChart", () => {
  it("shows a covered partial total without a misleading growth delta", () => {
    render(
      <ObservedMetricBarChart
        label="30-day runs"
        tone="orange"
        points={[
          { date: "2026-10-24", value: 10, coverage: { known: 1, total: 2 } },
          { date: "2026-10-25", value: 12, coverage: { known: 1, total: 2 } },
        ]}
      />,
    );
    expect(screen.getByText(/Partial total/)).toBeTruthy();
    expect(screen.getByText(/Latest coverage: 1 of 2 Actors/)).toBeTruthy();
    expect(screen.getByText("Change unavailable: incomplete coverage")).toBeTruthy();
    expect(screen.queryByText(/\+2 since/)).toBeNull();
  });

  it("does not label a complete latest reading as partial when earlier coverage was incomplete", () => {
    render(
      <ObservedMetricBarChart
        label="30-day runs"
        tone="orange"
        points={[
          { date: "2026-10-24", value: 10, coverage: { known: 1, total: 2 } },
          { date: "2026-10-25", value: 20, coverage: { known: 2, total: 2 } },
        ]}
      />,
    );
    expect(screen.queryByText(/Latest captured 30-day runs · Partial total/)).toBeNull();
    expect(screen.getByText(/Latest coverage: 2 of 2 Actors/)).toBeTruthy();
    expect(screen.getByText("Change unavailable: incomplete coverage")).toBeTruthy();
  });

  it("shows a clear baseline state until a second daily observation exists", () => {
    render(
      <ObservedMetricBarChart
        label="Active users"
        tone="blue"
        points={[
          { date: "2026-08-08", value: null },
          { date: "2026-08-09", value: null },
          { date: "2026-08-10", value: 307 },
        ]}
      />,
    );

    expect(screen.getByText("307")).toBeTruthy();
    expect(screen.getByText("1 of 3 UTC days captured")).toBeTruthy();
    expect(screen.getByText("Trend baseline is forming")).toBeTruthy();
    expect(screen.getByText(/first observation was captured on 10 Aug/i)).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Active users by UTC day" })).toBeNull();
  });

  it("shows the change after a second observed day", () => {
    render(
      <ObservedMetricBarChart
        label="Runs / 30d"
        tone="orange"
        points={[
          { date: "2026-08-09", value: 350 },
          { date: "2026-08-10", value: 383 },
        ]}
      />,
    );

    expect(screen.getByText(/\+33 since/i)).toBeTruthy();
    expect(screen.queryByText(/first observed day is shown now/i)).toBeNull();
  });

  it("keeps a zero value as an observed baseline", () => {
    const { container } = render(
      <ObservedMetricBarChart
        label="Active users"
        tone="blue"
        points={[
          { date: "2026-08-09", value: null },
          { date: "2026-08-10", value: 0 },
        ]}
      />,
    );

    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText(/first observation was captured on 10 Aug/i)).toBeTruthy();
    expect(container.querySelector('[title="9 Aug: not captured"]')).toBeNull();
  });

  it("does not count carried-forward values as captured days", () => {
    const { container } = render(
      <ObservedMetricBarChart
        label="Active users"
        tone="blue"
        points={[
          { date: "2026-08-08", value: 203, observed: true },
          { date: "2026-08-09", value: 203, observed: false },
        ]}
      />,
    );

    expect(screen.getByText("1 of 2 UTC days captured")).toBeTruthy();
    expect(screen.getByText("Trend baseline is forming")).toBeTruthy();
    expect(screen.getByText(/first observation was captured on 8 Aug/i)).toBeTruthy();
    expect(container.querySelector('[title="8 Aug: 203 active users"]')).toBeNull();
  });
});
