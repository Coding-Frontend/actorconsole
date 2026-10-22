import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingHeader } from "@/components/marketing/header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketingHeader", () => {
  it("shows only the get started action to anonymous visitors", () => {
    render(<MarketingHeader />);

    expect(screen.getAllByRole("link", { name: "Get started" })[0]?.getAttribute("href")).toBe(
      "/signup",
    );
    expect(screen.queryByText("Log in")).toBeNull();
    expect(screen.queryByRole("link", { name: "Go to console" })).toBeNull();
  });

  it("keeps the header action's label and color when scrolling", () => {
    const { container } = render(<MarketingHeader />);
    const fullAction = container.querySelector<HTMLAnchorElement>(".marketing-header-full-actions a");
    const compactAction = container.querySelector<HTMLAnchorElement>(".marketing-header-compact-actions a");

    expect(fullAction?.textContent).toBe("Get started");
    expect(compactAction?.textContent).toBe("Get started");
    expect(compactAction?.getAttribute("href")).toBe(fullAction?.getAttribute("href"));
    expect(compactAction?.className).toBe(fullAction?.className);

    vi.stubGlobal("scrollY", 100);
    fireEvent.scroll(window);
    expect(container.querySelector("header")?.className).toContain("marketing-header--scrolled");
  });

  it("only shows the console action to authenticated visitors", () => {
    render(<MarketingHeader isAuthenticated />);

    const consoleLinks = screen.getAllByRole("link", { name: "Go to console" });
    expect(consoleLinks).toHaveLength(1);
    expect(consoleLinks.every((link) => link.getAttribute("href") === "/dashboard")).toBe(true);
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Get started" })).toBeNull();
  });
});
