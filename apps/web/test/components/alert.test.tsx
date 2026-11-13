import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Alert } from "../../src/components/ui/alert";

afterEach(cleanup);

describe("Alert", () => {
  it("interrupts for danger and stays polite for other tones", () => {
    const { rerender } = render(<Alert tone="danger">Save failed.</Alert>);
    expect(screen.getByRole("alert").textContent).toContain("Save failed.");

    rerender(<Alert tone="success">Saved.</Alert>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Saved.");
  });

  it("lets callers override or switch off the live region", () => {
    const { rerender } = render(
      <Alert tone="warning" live="assertive">
        Quota almost used.
      </Alert>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();

    rerender(
      <Alert tone="info" live="off">
        Static note.
      </Alert>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Static note.")).toBeTruthy();
  });

  it("renders title, body and action together", () => {
    const onRetry = vi.fn();
    render(
      <Alert
        tone="danger"
        title="Could not load runs"
        action={<button onClick={onRetry}>Try again</button>}
      >
        The Apify API timed out.
      </Alert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Could not load runs");
    expect(alert.textContent).toContain("The Apify API timed out.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a labelled dismiss button only when onDismiss is given", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Alert>Heads up.</Alert>);
    expect(screen.queryByRole("button")).toBeNull();

    rerender(
      <Alert onDismiss={onDismiss} dismissLabel="Dismiss notice">
        Heads up.
      </Alert>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("supports a custom icon or none", () => {
    const { container, rerender } = render(<Alert icon={<span data-testid="custom" />}>A</Alert>);
    expect(screen.getByTestId("custom")).toBeTruthy();

    rerender(<Alert icon={false}>A</Alert>);
    expect(container.querySelector("svg")).toBeNull();
  });
});
