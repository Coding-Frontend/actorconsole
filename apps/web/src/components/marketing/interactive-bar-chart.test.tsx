import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractiveBarChart } from "./interactive-bar-chart";

vi.mock("chart.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("chart.js")>()),
  Chart: (await import("../../../test/chartjs-mock")).MockChart,
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
          { date: "2026-08-22", value: 7, coverage: { known: 1, total: 2 } },
        ]}
      />,
    );

    const canvas = screen.getByRole("img", { name: /active users by utc day/i });
    fireEvent.focus(canvas);
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(screen.getByText(/Partial: 1\/2 Actors\. Active users: 7/)).toBeTruthy();
  });
});
