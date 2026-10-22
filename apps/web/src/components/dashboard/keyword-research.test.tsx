import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeywordResearch } from "./keyword-research";
import { filterKeywordResults, keywordFunnel, type KeywordResult } from "./keyword-research-model";

const results: KeywordResult[] = [
  {
    id: "first",
    username: "apify",
    name: "alpha",
    title: "Alpha",
    monthlyUsers: 120,
    totalRuns: 800,
    opportunityScore: 75,
    difficultyScore: 32,
  },
  {
    id: "second",
    username: "apify",
    name: "beta",
    title: "Beta",
    monthlyUsers: 80,
    totalRuns: 1200,
    opportunityScore: 65,
    difficultyScore: 42,
  },
  {
    id: "third",
    username: "apify",
    name: "gamma",
    title: "Gamma",
    monthlyUsers: null,
    totalRuns: 10,
    opportunityScore: 90,
    difficultyScore: 15,
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("keyword research", () => {
  it("keeps funnel stages nested and only counts tracked shortlisted Actors", () => {
    const tracked = new Set(["apify/alpha", "apify/gamma"]);
    expect(keywordFunnel(results, tracked).map((step) => step.count)).toEqual([3, 2, 2, 1]);
    expect(
      filterKeywordResults(results, {
        sort: "monthlyUsers",
        minOpportunity: 70,
        hideTracked: true,
        trackedKeys: tracked,
      }),
    ).toEqual([]);
    expect(
      filterKeywordResults(results, {
        sort: "totalRuns",
        minOpportunity: 0,
        hideTracked: false,
        trackedKeys: tracked,
      }).map((item) => item.id),
    ).toEqual(["second", "first", "third"]);
  });

  it("switches to a data table and compares selected Store listings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/watchlist"))
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        if (String(input).includes("/search"))
          return new Response(
            JSON.stringify({
              data: results,
              meta: {
                searchVolume: 2,
                difficultyScore: 60,
                repeatUseRate: 12,
                methodology: "Catalog signals",
              },
            }),
            { status: 200 },
          );
        throw new Error(`Unexpected request: ${input}`);
      }),
    );
    vi.stubGlobal("scrollTo", vi.fn());
    Element.prototype.scrollIntoView = vi.fn();

    render(
      <KeywordResearch actors={[{ id: "workspace-1", username: "apify", actorName: "alpha" }]} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Keyword to research" }), {
      target: { value: "scraper" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Research keyword" }));
    expect(await screen.findByText("Demand snapshot")).toBeTruthy();
    expect(
      within(screen.getByLabelText("Opportunity funnel")).getByText("In workspace"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /List/ }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(window.localStorage.getItem("actorconsole:keyword-results-view")).toBe("list");

    fireEvent.click(screen.getByRole("button", { name: /Filter & sort/ }));
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "totalRuns" } });
    expect(within(table).getAllByRole("row")[1].textContent).toContain("Beta");

    fireEvent.click(within(table).getByRole("checkbox", { name: "Compare Alpha" }));
    fireEvent.click(within(table).getByRole("checkbox", { name: "Compare Beta" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare selected" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Compare Actors" })).toBeTruthy(),
    );
    expect(
      within(screen.getByLabelText("Actor comparison")).getByText("30-day users"),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search Actors to compare" }), {
      target: { value: "Gamma" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Gamma to comparison" }));
    expect(within(screen.getByLabelText("Actor comparison")).getByText("Gamma")).toBeTruthy();
    expect(screen.getAllByText("3 of 5 selected")).toHaveLength(2);
  });

  it("restores selected Actors and the source results after leaving the full comparison", async () => {
    window.sessionStorage.setItem(
      "actorconsole:keyword-comparison",
      JSON.stringify({ keyword: "scraper", results: results.slice(0, 2), available: results }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    render(<KeywordResearch actors={[]} />);
    expect(await screen.findByText("Demand snapshot")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Keyword to research" })).toHaveProperty(
      "value",
      "scraper",
    );
    expect(screen.getByText("2 Actors selected")).toBeTruthy();
    expect(window.sessionStorage.getItem("actorconsole:keyword-comparison")).toContain("alpha");
  });
});
