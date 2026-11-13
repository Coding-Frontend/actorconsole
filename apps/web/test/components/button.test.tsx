import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../../src/components/ui/button";

afterEach(cleanup);

describe("Button component", () => {
  it("renders with default variant and children", () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole("button", { name: /click me/i });
    expect(btn).toBeTruthy();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("calls onClick handler when clicked", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Submit</Button>);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("can be disabled", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled</Button>);
    const btn = screen.getByRole("button", { name: /disabled/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders as a link when asChild is true", () => {
    render(
      <Button asChild>
        <a href="/dashboard">Go to Dashboard</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: /go to dashboard/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/dashboard");
  });

  it("renders with secondary variant", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole("button", { name: /secondary/i });
    expect(btn.className).toContain("hover:bg-secondary/75");
  });

  it("renders with ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button", { name: /ghost/i });
    expect(btn.className).toContain("hover:bg-accent");
  });

  it("spreads additional HTML attributes", () => {
    render(<Button data-testid="test-btn" type="submit">Submit</Button>);
    const btn = screen.getByTestId("test-btn");
    expect(btn.getAttribute("type")).toBe("submit");
  });

  describe("loading state", () => {
    it("stays focusable but ignores clicks and marks itself busy", () => {
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Save
        </Button>,
      );
      const btn = screen.getByRole("button", { name: "Save" });
      expect(btn.hasAttribute("disabled")).toBe(false);
      expect(btn.getAttribute("aria-busy")).toBe("true");
      expect(btn.getAttribute("aria-disabled")).toBe("true");
      btn.focus();
      expect(document.activeElement).toBe(btn);
      fireEvent.click(btn);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("blocks form submission while loading", () => {
      const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <Button type="submit" loading>
            Send
          </Button>
        </form>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("swaps in loadingText and a decorative spinner in place of leading icons", () => {
      render(
        <Button loading loadingText="Saving…">
          <svg data-testid="icon" />
          Save
        </Button>,
      );
      const btn = screen.getByRole("button", { name: "Saving…" });
      expect(btn.querySelector('[data-slot="spinner"]')?.getAttribute("aria-hidden")).toBe("true");
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByTestId("icon")).toBeNull();
    });

    it("replaces only a leading icon, keeping text, wrapped labels and trailing icons", () => {
      const { rerender } = render(
        <Button loading>
          <svg data-testid="leading" /> Save
        </Button>,
      );
      expect(screen.queryByTestId("leading")).toBeNull();
      expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();

      rerender(
        <Button loading>
          Continue <svg data-testid="trailing" />
        </Button>,
      );
      expect(screen.getByTestId("trailing")).toBeTruthy();

      rerender(
        <Button loading>
          <span>Publish</span>
        </Button>,
      );
      expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
    });

    it("returns to a normal button once loading ends", () => {
      const onClick = vi.fn();
      const { rerender } = render(
        <Button loading onClick={onClick}>
          Save
        </Button>,
      );
      rerender(<Button onClick={onClick}>Save</Button>);
      const btn = screen.getByRole("button", { name: "Save" });
      expect(btn.hasAttribute("aria-busy")).toBe(false);
      expect(btn.querySelector('[data-slot="spinner"]')).toBeNull();
      fireEvent.click(btn);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("keeps asChild links intact and prevents navigation while loading", () => {
      render(
        <Button asChild loading>
          <a href="/export">Export</a>
        </Button>,
      );
      const link = screen.getByRole("link", { name: "Export" });
      expect(link.getAttribute("aria-busy")).toBe("true");
      expect(link.querySelector('[data-slot="spinner"]')).toBeNull();
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });
});
