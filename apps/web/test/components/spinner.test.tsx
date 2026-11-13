import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Spinner } from "../../src/components/ui/spinner";

afterEach(cleanup);

describe("Spinner", () => {
  it("announces a polite status with a default label", () => {
    render(<Spinner />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading");
    expect(status.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses a specific label when given one", () => {
    render(<Spinner label="Loading invoices" />);
    expect(screen.getByRole("status").textContent).toBe("Loading invoices");
  });

  it("renders only a hidden icon when decorative", () => {
    const { container } = render(<Spinner decorative size="lg" />);
    expect(screen.queryByRole("status")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("class")).toContain("size-6");
  });
});
