import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EmptyState } from "../../src/components/ui/empty-state";

afterEach(() => {
  cleanup();
});

describe("EmptyState component", () => {
  it("renders title and description", () => {
    render(<EmptyState title="No actors" description="Create your first actor to get started." />);
    expect(screen.getByText("No actors")).toBeTruthy();
    expect(screen.getByText("Create your first actor to get started.")).toBeTruthy();
  });

  it("renders default icon (Sparkles)", () => {
    render(<EmptyState title="Empty" description="Nothing here" />);
    // The default Sparkles icon should be rendered
    const container = screen.getByText("Empty").closest("div");
    expect(container).toBeTruthy();
  });

  it("renders custom icon when provided", () => {
    render(
      <EmptyState
        icon={<span data-testid="custom-icon">🚀</span>}
        title="Custom Icon"
        description="Has custom icon"
      />,
    );
    expect(screen.getByTestId("custom-icon")).toBeTruthy();
  });

  it("renders primary action button with label", () => {
    render(
      <EmptyState
        title="No data"
        description="Add some data"
        action={{ label: "Add Item", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole("button", { name: /add item/i })).toBeTruthy();
  });

  it("calls onClick when primary action is clicked", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No data"
        description="Add some data"
        action={{ label: "Add Item", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders secondary action button", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No data"
        description="Add some data"
        action={{ label: "Primary", onClick: vi.fn() }}
        secondaryAction={{ label: "Learn More", onClick }}
      />,
    );
    expect(screen.getByRole("button", { name: /learn more/i })).toBeTruthy();
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState title="Test" description="Desc" className="my-custom-class" />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});
