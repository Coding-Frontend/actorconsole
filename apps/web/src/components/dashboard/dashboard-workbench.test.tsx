import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/actors",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

import {
  AdvancedSettings,
  DashboardAsyncState,
  DashboardBreadcrumbs,
  DashboardFilterSummary,
  DashboardPageHeader,
  PageActionMenu,
  SelectionActionBar,
} from "./dashboard-workbench";

describe("dashboard workbench primitives", () => {
  afterEach(cleanup);

  it("renders one clear page title and primary action region", () => {
    render(
      <DashboardPageHeader
        context="Workspace / Portfolio"
        title="Actors"
        description="Manage connected Actors."
        primaryAction={<button type="button">Sync Actors</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Actors" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync Actors" })).toBeTruthy();
  });

  it("shows a single page action as a direct link alongside the primary action", () => {
    render(
      <DashboardPageHeader
        context="Actors / example"
        title="Example Actor"
        secondaryActions={[{ label: "SEO audit", href: "/dashboard/tools/seo?actor=example" }]}
        primaryAction={<button type="button">Open in Apify</button>}
      />,
    );

    expect(screen.getByRole("link", { name: "SEO audit" }).getAttribute("href")).toBe(
      "/dashboard/tools/seo?actor=example",
    );
    expect(screen.getByRole("button", { name: "Open in Apify" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("runs a single action directly without submitting its enclosing form", () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PageActionMenu items={[{ label: "Clear selection", onSelect }]} />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it.each([undefined, "/dashboard/actors"])(
    "keeps a disabled single action inert (href: %s)",
    (href) => {
      const onSelect = vi.fn();
      render(<PageActionMenu items={[{ label: "Unavailable", href, onSelect, disabled: true }]} />);

      const action = screen.getByRole("button", { name: "Unavailable" });
      expect(action.hasAttribute("disabled")).toBe(true);
      expect(screen.queryByRole("link")).toBeNull();
      fireEvent.click(action);
      expect(onSelect).not.toHaveBeenCalled();
    },
  );

  it("hides empty actions and retains a keyboard-accessible menu for multiple actions", async () => {
    const onSelect = vi.fn();
    const { container, rerender } = render(<PageActionMenu items={[]} />);
    expect(container.childElementCount).toBe(0);

    rerender(
      <PageActionMenu
        items={[
          { label: "Actor portfolio", href: "/dashboard/actors" },
          { label: "Refresh review", onSelect },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(await screen.findByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Actor portfolio" }).getAttribute("href")).toBe(
      "/dashboard/actors",
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Refresh review" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("reveals selection actions only after a selection exists", () => {
    const { rerender } = render(
      <SelectionActionBar count={0} noun="Actor">
        <button type="button">Generate improvements</button>
      </SelectionActionBar>,
    );
    expect(screen.queryByRole("region", { name: "Selection actions" })).toBeNull();

    rerender(
      <SelectionActionBar count={2} noun="Actor">
        <button type="button">Generate improvements</button>
      </SelectionActionBar>,
    );
    expect(screen.getByText("2 Actors selected")).toBeTruthy();
  });

  it("keeps advanced controls collapsed until requested", () => {
    render(
      <AdvancedSettings>
        <label htmlFor="cron">Custom cron</label>
        <input id="cron" />
      </AdvancedSettings>,
    );

    const disclosure = screen.getByText("Advanced settings").closest("details");
    expect(disclosure?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByText("Advanced settings"));
    expect(disclosure?.hasAttribute("open")).toBe(true);
  });

  it("exposes recovery controls for rate-limited data", () => {
    const onRetry = vi.fn();
    render(<DashboardAsyncState status="rate-limited" onRetry={onRetry} />);

    expect(screen.getByRole("alert").getAttribute("data-dashboard-state")).toBe("rate-limited");
    expect(screen.getByText("Apify rate limit reached")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps page context and filter scope shareable", () => {
    const onReset = vi.fn();
    render(
      <>
        <DashboardBreadcrumbs
          items={[{ label: "Workspace", href: "/dashboard" }, { label: "Usage" }]}
        />
        <DashboardFilterSummary
          items={["All Actors", "Last 30 days", "Daily · UTC"]}
          onReset={onReset}
        />
      </>,
    );

    expect(screen.getByRole("link", { name: "Workspace" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.getByText("Daily · UTC")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("keeps a clear-selection action visible whenever rows are selected", () => {
    const onClear = vi.fn();
    render(
      <SelectionActionBar count={3} noun="Actor" onClear={onClear}>
        <button type="button">Change status</button>
      </SelectionActionBar>,
    );

    const clearButton = screen.getByRole("button", { name: "Clear selection" });
    expect(clearButton).toBeTruthy();
    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
