import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingHeader } from "@/components/marketing/header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const { session } = vi.hoisted(() => ({ session: { status: "unauthenticated" } }));
vi.mock("@/lib/session-client", () => ({ useSession: () => session }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  session.status = "unauthenticated";
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

  it("compacts on scroll, restores the links near the top, and keeps the account action available", () => {
    vi.stubGlobal("scrollY", 0);
    render(<MarketingHeader />);
    const header = screen.getByRole("banner");
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    const pricing = within(navigation).getByRole("link", { name: "Pricing" });
    const action = screen.getByRole("link", { name: "Get started" });
    pricing.focus();

    vi.stubGlobal("scrollY", 73);
    fireEvent.scroll(window);

    expect(header.classList.contains("marketing-header--scrolled")).toBe(true);
    expect(navigation.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "ActorConsole home" }));
    expect(screen.getByRole("link", { name: "Get started" })).toBe(action);

    vi.stubGlobal("scrollY", 72);
    fireEvent.scroll(window);

    expect(header.classList.contains("marketing-header--scrolled")).toBe(false);
    expect(navigation.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("link", { name: "Pricing" })).toBe(pricing);
    expect(screen.getByRole("link", { name: "Get started" })).toBe(action);
  });

  it("only shows the console action to authenticated visitors", () => {
    render(<MarketingHeader isAuthenticated />);

    const consoleLinks = screen.getAllByRole("link", { name: "Go to console" });
    expect(consoleLinks).toHaveLength(1);
    expect(consoleLinks.every((link) => link.getAttribute("href") === "/dashboard")).toBe(true);
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Get started" })).toBeNull();
  });

  it("uses the client session when public rendering has no server session dependency", () => {
    session.status = "loading";
    const { rerender } = render(<MarketingHeader />);
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();

    session.status = "authenticated";
    rerender(<MarketingHeader />);
    expect(screen.getByRole("link", { name: "Go to console" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByRole("link", { name: "Get started" })).toBeNull();
  });
});
