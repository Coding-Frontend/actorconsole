import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderProfileChart } from "./builder-profile-chart";

vi.mock("./observed-metric-bar-chart", () => ({
  ObservedMetricBarChart: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock("./interactive-bar-chart", () => ({ InteractiveBarChart: () => null }));
afterEach(cleanup);

describe("builder user history units", () => {
  it("labels discovery dates separately from publication dates", () => {
    render(
      <BuilderProfileChart
        discoveries={[{ date: "2026-10-08", actors: 74 }]}
        trends={[]}
        window={30}
      />,
    );
    expect(screen.getByText("Daily discoveries")).toBeTruthy();
    expect(screen.getByText("74")).toBeTruthy();
    expect(screen.getByText(/discovery date, not the publication date/)).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Published via ActorConsole" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText(/may include republications/)).toBeTruthy();
  });

  it.each([7, 30, 90])("labels rolling user history explicitly in a %s-day view", (window) => {
    render(<BuilderProfileChart trends={[]} window={window} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Active users / 30d" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("tabpanel").textContent).toContain("rolling 30-day user counts");
  });
});
