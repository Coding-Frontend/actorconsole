import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractiveBarChart } from "./interactive-bar-chart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: ({ name }: { name: string }) => <div data-testid="interactive-series">{name}</div>,
  CartesianGrid: () => null,
  Tooltip: () => <div data-testid="interactive-tooltip" />,
  XAxis: () => null,
  YAxis: () => null,
}));

afterEach(cleanup);

describe("InteractiveBarChart", () => {
  it("provides an accessible chart and an interactive tooltip", () => {
    render(
      <InteractiveBarChart
        label="Active users"
        tone="blue"
        points={[
          { date: "2026-08-21", value: 4 },
          { date: "2026-08-22", value: 7 },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: /active users by utc day/i })).toBeTruthy();
    expect(screen.getByTestId("interactive-tooltip")).toBeTruthy();
    expect(screen.getByTestId("interactive-series").textContent).toBe("Active users");
  });
});
