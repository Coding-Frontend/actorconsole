import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicCompareButton, PublicComparisonProvider } from "./public-comparison-provider";
import type { PublicCompareItem } from "./public-comparison-items";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/builders",
  useRouter: () => ({ push }),
}));

const first: PublicCompareItem = {
  kind: "builder",
  id: "first",
  username: "first",
  title: "First builder",
  subtitle: "@first",
  window: 90,
  metrics: { actorCount: 4 },
};

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  push.mockClear();
});

describe("public comparison navigation", () => {
  it("opens the comparison page directly and reopens it without duplicating a builder", () => {
    render(
      <PublicComparisonProvider>
        <PublicCompareButton item={first} />
      </PublicComparisonProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare First builder" }));
    expect(push).toHaveBeenLastCalledWith("/builders/compare/first?window=90");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open comparison for First builder" }));
    expect(push).toHaveBeenLastCalledWith("/builders/compare/first?window=90");
    fireEvent.click(screen.getByRole("button", { name: "Compare selected" }));
    expect(push).toHaveBeenLastCalledWith("/builders/compare/first?window=90");
  });

  it("preserves saved selections and their reporting period when comparing a new builder", () => {
    window.sessionStorage.setItem(
      "actorconsole:public-comparison",
      JSON.stringify({ builder: [first], actor: [] }),
    );
    const second = {
      ...first,
      id: "second",
      username: "second",
      title: "Second builder",
      window: 30 as const,
    };
    render(
      <PublicComparisonProvider>
        <PublicCompareButton item={second} />
      </PublicComparisonProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare Second builder" }));
    expect(push).toHaveBeenLastCalledWith("/builders/compare/first/second?window=90");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the five-builder limit while navigating to the existing comparison", () => {
    const builders = Array.from({ length: 5 }, (_, index) => ({
      ...first,
      id: `builder-${index}`,
    }));
    window.sessionStorage.setItem(
      "actorconsole:public-comparison",
      JSON.stringify({ builder: builders, actor: [] }),
    );
    render(
      <PublicComparisonProvider>
        <PublicCompareButton item={first} />
      </PublicComparisonProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare First builder" }));
    expect(push).toHaveBeenLastCalledWith(
      "/builders/compare/builder-0/builder-1/builder-2/builder-3/builder-4?window=90",
    );
  });

  it("uses the Actor comparison page for Actor selections", () => {
    const actor: PublicCompareItem = {
      ...first,
      kind: "actor",
      id: "first/scraper",
      title: "Scraper",
    };
    render(
      <PublicComparisonProvider>
        <PublicCompareButton item={actor} />
      </PublicComparisonProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare Scraper" }));
    expect(push).toHaveBeenLastCalledWith("/actors/compare/first/scraper?window=90");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
