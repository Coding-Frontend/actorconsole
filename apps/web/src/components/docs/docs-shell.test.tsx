import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocsLayout from "@/app/(marketing)/docs/layout";
import DocsLoading from "@/app/(marketing)/docs/loading";

const navigation = vi.hoisted(() => ({ pathname: "/docs/first-workspace", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

afterEach(() => {
  cleanup();
  navigation.pathname = "/docs/first-workspace";
  navigation.push.mockClear();
});

describe("persistent documentation navigation", () => {
  it("focuses search from click and keyboard, then restores the trigger on Escape", () => {
    render(<DocsLayout><h1>Guide</h1></DocsLayout>);
    const trigger = screen.getByRole("button", { name: /^Search docs$/ });
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });
  it("retains the sidebar, toolbar, scroll and expanded groups as guide content changes", () => {
    const { rerender } = render(
      <DocsLayout>
        <h1>First workspace article</h1>
      </DocsLayout>,
    );
    const sidebar = screen.getByRole("complementary", { name: "Documentation sections" });
    const toolbar = screen.getByRole("navigation", { name: "Breadcrumb" });
    const research = screen.getByText("Research", { selector: "summary" })
      .parentElement as HTMLDetailsElement;
    research.open = true;
    sidebar.scrollTop = 180;
    fireEvent.click(screen.getByRole("button", { name: "Search docs" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "token" } });

    navigation.pathname = "/docs/dashboard-tour";
    rerender(
      <DocsLayout>
        <h1>Dashboard article</h1>
      </DocsLayout>,
    );

    expect(screen.queryByRole("heading", { name: "First workspace article" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Dashboard article" })).toBeDefined();
    expect(screen.getByRole("complementary", { name: "Documentation sections" })).toBe(sidebar);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBe(toolbar);
    expect(sidebar.scrollTop).toBe(180);
    expect(research.open).toBe(true);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("token");
    expect(sidebar.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Find your way around",
    );

    rerender(
      <DocsLayout>
        <DocsLoading />
      </DocsLayout>,
    );
    expect(screen.getByRole("status", { name: "Loading documentation" })).toBeDefined();
    expect(screen.getByRole("complementary", { name: "Documentation sections" })).toBe(sidebar);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBe(toolbar);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("routes the mobile guide selector through client navigation", () => {
    render(
      <DocsLayout>
        <h1>Guide</h1>
      </DocsLayout>,
    );
    fireEvent.change(screen.getByLabelText("Jump to a documentation section"), {
      target: { value: "pricing" },
    });
    expect(navigation.push).toHaveBeenCalledWith("/docs/pricing");
  });
});
