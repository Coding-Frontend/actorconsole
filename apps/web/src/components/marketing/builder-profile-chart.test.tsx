import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderProfileChart } from "./builder-profile-chart";

vi.mock("./observed-metric-bar-chart", () => ({
  ObservedMetricBarChart: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock("./interactive-bar-chart", () => ({ InteractiveBarChart: () => null }));
afterEach(cleanup);

describe("builder user history units", () => {
  it("does not draw a zero publishing chart when publication dates are unknown", () => {
    render(
      <BuilderProfileChart
        publishing={[{ date: "2026-09-30", actors: 0 }]}
        trends={[]}
        window={30}
        publicationCoverage={{ known: 0, total: 74 }}
      />,
    );
    expect(screen.getByText("Publication dates unavailable")).toBeTruthy();
    expect(screen.queryByText("Confirmed daily publishing")).toBeNull();
    expect(screen.getByText(/Upload dates and first discovery are not used/)).toBeTruthy();
  });

  it.each([7, 30, 90])("labels rolling user history explicitly in a %s-day view", (window) => {
    render(<BuilderProfileChart publishing={[]} trends={[]} window={window} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Active users / 30d" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("tabpanel").textContent).toContain("rolling 30-day user counts");
  });
});
