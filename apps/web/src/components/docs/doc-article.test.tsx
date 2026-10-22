import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findDocGuide } from "@/lib/documentation";
import { DocArticle } from "./doc-article";

vi.mock("@/components/chrome-extension-link", () => ({ ChromeExtensionLink: () => null }));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("concise documentation articles", () => {
  it("keeps the full MCP reference closed until requested", () => {
    const { container } = render(<DocArticle guide={findDocGuide("mcp-tools")!} />);
    expect((container.querySelector("#tool-reference") as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByRole("heading", { name: "Steps" })).toBeDefined();
    expect(screen.getByText("list_actors", { selector: "td" })).toBeDefined();
  });

  it("reveals an advanced section when following its direct link", () => {
    window.history.replaceState(null, "", "/docs/pricing#events");
    const { container } = render(<DocArticle guide={findDocGuide("pricing")!} />);
    const section = container.querySelector("#events") as HTMLDetailsElement;
    expect(section.open).toBe(true);
    section.open = false;
    fireEvent(window, new Event("hashchange"));
    expect(section.open).toBe(true);
  });
});
