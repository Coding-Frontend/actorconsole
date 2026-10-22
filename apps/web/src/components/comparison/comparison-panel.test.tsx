import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ComparisonPanel } from "./comparison-panel";
import type { ComparisonItem, ComparisonRow } from "./comparison-ui";

const rows: ComparisonRow[] = [
  { key: "users", label: "Active users", group: "Usage" },
  { key: "runs", label: "Runs", group: "Usage" },
  { key: "rating", label: "Rating", group: "Trust", format: "rating" },
];
const items: ComparisonItem[] = [
  { id: "alpha", title: "Alpha", subtitle: "@alpha", metrics: { users: 10, runs: 5, rating: 4 } },
  { id: "beta", title: "Beta", subtitle: "@beta", metrics: { users: 20, runs: 5, rating: null } },
];

afterEach(cleanup);

describe("comparison filters", () => {
  it("filters by section, metric name, differences, and complete data", () => {
    render(<ComparisonPanel items={items} rows={rows} />);
    expect(screen.getByText("3 of 3 details")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Usage" }));
    expect(screen.getByText("2 of 3 details")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Differences only" }));
    expect(screen.getByText("1 of 3 details")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("Active users")).toBeTruthy();
    expect(within(screen.getByRole("table")).queryByText("Runs")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete data only" }));
    expect(screen.getByText("1 of 3 details")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Find a metric" }), {
      target: { value: "rating" },
    });
    expect(screen.getByText("No details match these filters")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all details" }));
    expect(screen.getByText("3 of 3 details")).toBeTruthy();
  });
});
