import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderProfileChart } from "./builder-profile-chart";

vi.mock("./observed-metric-bar-chart", () => ({
  ObservedMetricBarChart: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock("./interactive-bar-chart", () => ({ InteractiveBarChart: () => null }));
afterEach(cleanup);

describe("builder user history units", () => {
  it.each([7, 30, 90])("labels rolling user history explicitly in a %s-day view", (window) => {
    render(<BuilderProfileChart publishing={[]} trends={[]} window={window} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Active users / 30d" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByRole("tabpanel").textContent).toContain("rolling 30-day user counts");
  });
});
