import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChangelogList } from "./changelog-list";
import { changelogQuery } from "@/lib/changelog";
import { changelogFeed } from "@/lib/changelog-feed";
import type { ChangelogListing } from "@/services/changelog";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const data: ChangelogListing = {
  items: [
    {
      id: "a",
      slug: "new-dashboard",
      title: "New dashboard",
      text: "Summary",
      category: "RELEASE",
      type: "FEATURE",
      releaseDate: "2026-10-05",
      version: "1.2",
      sortOrder: 0,
      tags: ["api", "dashboard"],
    },
  ],
  total: 230,
  page: 1,
  limit: 50,
  year: 2026,
  years: [2026, 2025],
  tags: ["api", "dashboard"],
  months: [
    { month: "2026-10", count: 230 },
    { month: "2026-09", count: 5 },
  ],
};
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
describe("Changelog browsing", () => {
  it("opens the latest month and provides complete archive navigation", () => {
    const { container } = render(<ChangelogList data={data} query="" />);
    expect(container.querySelector("details[open]")?.textContent).toContain("October 2026");
    expect(screen.getByRole("link", { name: "New dashboard" }).getAttribute("href")).toBe(
      "/changelog/new-dashboard",
    );
    expect(
      screen.getByRole("link", { name: /Browse all 5 updates/ }).getAttribute("href"),
    ).toContain("month=9");
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toContain("page=2");
  });
  it("resets pagination and month when changing the category or year", () => {
    render(<ChangelogList data={data} query="year=2026&page=3&month=10&tag=api" />);
    fireEvent.click(screen.getByRole("button", { name: /^Improvements$/ }));
    let url = push.mock.calls.at(-1)?.[0];
    expect(url).toContain("category=IMPROVEMENT");
    expect(url).toContain("tag=api");
    expect(url).not.toContain("page=");
    expect(url).not.toContain("month=");
    fireEvent.change(screen.getByLabelText("Changelog year"), { target: { value: "2025" } });
    url = push.mock.calls.at(-1)?.[0];
    expect(url).toContain("year=2025");
    expect(url).not.toContain("page=");
  });
  it("applies multiple product areas with all matching to a shareable URL", () => {
    render(<ChangelogList data={data} query="year=2026&page=2" />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters$/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "API" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Dashboard" }));
    fireEvent.click(screen.getByRole("radio", { name: "All selected areas" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    const url = push.mock.calls.at(-1)?.[0];
    expect(url).toContain("tag=api&tag=dashboard");
    expect(url).toContain("match=all");
    expect(url).not.toContain("page=");
  });
  it("returns keyboard focus to the filter trigger after dismissal", async () => {
    render(<ChangelogList data={data} query="" />);
    const trigger = screen.getByRole("button", { name: /^Filters$/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("clears filters while keeping the selected year", () => {
    render(<ChangelogList data={data} query="year=2026&tag=api&category=RELEASE&match=all" />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(push).toHaveBeenCalledWith("/changelog?year=2026", { scroll: false });
  });
  it("shows an actionable empty state for unmatched filters", () => {
    render(<ChangelogList data={{ ...data, items: [], total: 0, months: [] }} query="tag=api" />);
    expect(screen.getByRole("heading", { name: "No matching updates" })).toBeTruthy();
  });
});
describe("Changelog URL and RSS handling", () => {
  it("drops invalid URL inputs and deduplicates tags", () => {
    const params = changelogQuery({
      category: "toString",
      year: "0",
      page: "NaN",
      month: "13",
      tag: ["api", "api", "invalid tag"],
      match: "all",
    });
    expect(params.toString()).toBe("match=all&tag=api");
  });
  it("escapes XML metacharacters and includes stable links and UTC dates", () => {
    const xml = changelogFeed(
      [{ ...data.items[0], title: 'API <update> & "more"', text: "A & B\u0000", tags: ["api"] }],
      "https://actorconsole.com/",
    );
    expect(xml).toContain("API &lt;update&gt; &amp; &quot;more&quot;");
    expect(xml).toContain("<description>A &amp; B</description>");
    expect(xml).toContain(
      '<guid isPermaLink="true">https://actorconsole.com/changelog/new-dashboard</guid>',
    );
    expect(xml).toContain("Mon, 05 Oct 2026 00:00:00 GMT");
  });
});
