import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../../src/components/ui/badge";

describe("Badge component", () => {
  it("renders with default variant", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("renders with secondary variant", () => {
    render(<Badge variant="secondary">Draft</Badge>);
    const badge = screen.getByText("Draft");
    expect(badge).toBeTruthy();
    expect(badge.className).toContain("bg-secondary");
  });

  it("renders with outline variant", () => {
    render(<Badge variant="outline">v1.0</Badge>);
    const badge = screen.getByText("v1.0");
    expect(badge).toBeTruthy();
    expect(badge.className).toContain("text-foreground");
  });

  it("renders with success variant", () => {
    render(<Badge variant="success">Running</Badge>);
    const badge = screen.getByText("Running");
    expect(badge).toBeTruthy();
    expect(badge.className).toContain("bg-signal-green/10");
  });

  it("renders with warning variant", () => {
    render(<Badge variant="warning">Queued</Badge>);
    const badge = screen.getByText("Queued");
    expect(badge).toBeTruthy();
    expect(badge.className).toContain("bg-signal-orange/10");
  });

  it("renders with destructive variant", () => {
    render(<Badge variant="destructive">Failed</Badge>);
    const badge = screen.getByText("Failed");
    expect(badge).toBeTruthy();
    expect(badge.className).toContain("bg-destructive");
  });

  it("accepts custom className", () => {
    render(<Badge className="my-custom-class">Custom</Badge>);
    const badge = screen.getByText("Custom");
    expect(badge.className).toContain("my-custom-class");
  });

  it("spreads additional HTML attributes", () => {
    render(<Badge data-testid="test-badge" title="tooltip">Info</Badge>);
    const badge = screen.getByTestId("test-badge");
    expect(badge.getAttribute("title")).toBe("tooltip");
  });
});
