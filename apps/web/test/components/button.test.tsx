import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../../src/components/ui/button";

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
});
