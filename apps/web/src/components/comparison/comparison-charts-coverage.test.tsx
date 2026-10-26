import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComparisonCharts } from "./comparison-charts";

vi.mock("recharts", () =>
  Object.fromEntries(
    [
      "Bar",
      "BarChart",
      "CartesianGrid",
      "Cell",
      "Legend",
      "LabelList",
      "Line",
      "LineChart",
      "ResponsiveContainer",
      "Tooltip",
      "XAxis",
      "YAxis",
    ].map((name) => [name, () => null]),
  ),
);

afterEach(cleanup);

describe("comparison history coverage", () => {
  it("identifies partial run series and exposes the per-day Actor coverage", () => {
    render(
      <ComparisonCharts
        kind="builder"
        window={30}
        items={[
          {
            id: "builder",
            kind: "builder",
            username: "builder",
            title: "Builder",
            subtitle: "@builder",
            window: 30,
            metrics: { actorCount: 2, recentRuns: 25 },
            history: [
              { date: "2026-10-24", users: 10, runs: 20, runsCoverage: { known: 1, total: 2 } },
              { date: "2026-10-25", users: 11, runs: 25, runsCoverage: { known: 1, total: 2 } },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText(/Partial totals for Builder/)).toBeTruthy();
    expect(screen.getByText("25 · 1/2 Actors")).toBeTruthy();
  });
});
