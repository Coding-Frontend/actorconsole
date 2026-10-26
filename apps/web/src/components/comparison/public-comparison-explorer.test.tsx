import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicComparisonExplorer } from "./public-comparison-explorer";
import type { PublicCompareItem } from "./public-comparison-items";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("./comparison-charts", () => ({ ComparisonCharts: () => null }));

const first: PublicCompareItem = {
  kind: "builder",
  id: "first",
  username: "first",
  title: "First builder",
  subtitle: "@first",
  window: 30,
  metrics: { actorCount: 4, activeUsers: 12 },
};
const second: PublicCompareItem = {
  kind: "builder",
  id: "second",
  username: "second",
  title: "Second builder",
  subtitle: "@second",
  window: 30,
  metrics: { actorCount: 2, activeUsers: 8 },
};

afterEach(() => {
  cleanup();
  push.mockClear();
  vi.unstubAllGlobals();
});

describe("public comparison explorer", () => {
  it("searches for another builder without leaving the comparison and preserves the period", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ items: [second] }), { status: 200 })),
    );
    render(<PublicComparisonExplorer items={[first]} kind="builder" window={30} mode="page" />);

    fireEvent.click(screen.getByRole("button", { name: "Select a builder" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search builders to compare" }), {
      target: { value: "second" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Second builder to comparison" }),
    );
    expect(push).toHaveBeenCalledWith("/builders/compare/first/second", { scroll: false });
  });

  it("keeps one builder beside a selection column and fills the next column when added", () => {
    const { rerender } = render(
      <PublicComparisonExplorer items={[first]} kind="builder" window={90} mode="page" />,
    );
    const comparison = screen.getByRole("region", { name: "Builder comparison" });
    expect(comparison.contains(screen.getByRole("button", { name: "Change First builder" }))).toBe(
      true,
    );
    expect(comparison.contains(screen.getByRole("button", { name: "Select a builder" }))).toBe(
      true,
    );
    expect(
      screen.getByRole("checkbox", { name: "Differences only" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Find a metric" }), {
      target: { value: "unknown metric" },
    });
    expect(screen.getByText("No details match these filters")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select a builder" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all details" }));

    rerender(
      <PublicComparisonExplorer items={[first, second]} kind="builder" window={90} mode="page" />,
    );
    expect(comparison.contains(screen.getByRole("button", { name: "Change Second builder" }))).toBe(
      true,
    );
    expect(
      screen.getByRole("checkbox", { name: "Differences only" }).hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove Second builder from comparison" }));
    expect(push).toHaveBeenCalledWith("/builders/compare/first?window=90", { scroll: false });
  });

  it("hides the selection column at the five-builder limit", () => {
    const selected = Array.from({ length: 5 }, (_, index) => ({
      ...first,
      id: `builder-${index}`,
      title: `Builder ${index}`,
    }));
    render(<PublicComparisonExplorer items={selected} kind="builder" window={30} mode="page" />);
    expect(screen.queryByRole("button", { name: "Select a builder" })).toBeNull();
    expect(screen.getByRole("button", { name: "Change Builder 4" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add builder" })).toBeNull();
  });

  it("replaces a selected builder at the limit without changing the reporting period", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ items: [second] }), { status: 200 })),
    );
    const selected = Array.from({ length: 5 }, (_, index) => ({
      ...first,
      id: `builder-${index}`,
      title: `Builder ${index}`,
    }));
    render(<PublicComparisonExplorer items={selected} kind="builder" window={90} mode="page" />);
    fireEvent.click(screen.getByRole("button", { name: "Change Builder 2" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search builders to compare" }), {
      target: { value: "second" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Second builder to comparison" }),
    );
    expect(push).toHaveBeenCalledWith(
      "/builders/compare/builder-0/builder-1/second/builder-3/builder-4?window=90",
      { scroll: false },
    );
  });

  it("preserves metric filters when selections and period change", () => {
    const { rerender } = render(
      <PublicComparisonExplorer items={[first]} kind="builder" window={30} mode="page" />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Find a metric" }), {
      target: { value: "Published Actors" },
    });
    rerender(
      <PublicComparisonExplorer items={[first, second]} kind="builder" window={90} mode="page" />,
    );
    expect((screen.getByRole("textbox", { name: "Find a metric" }) as HTMLInputElement).value).toBe(
      "Published Actors",
    );
    expect(screen.getByText("1 of 17 details")).toBeTruthy();
  });
});
