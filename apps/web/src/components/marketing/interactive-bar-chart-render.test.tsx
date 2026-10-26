import { cloneElement, type ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractiveBarChart } from "./interactive-bar-chart";

vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  // Give the real chart a fixed viewport without depending on layout in the DOM shim.
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width: number; height: number }> }) =>
    cloneElement(children, { width: 600, height: 240 }),
}));

afterEach(cleanup);

describe("observed bar rendering", () => {
  it("leaves missing observations empty while keeping a captured zero visible", () => {
    const { container } = render(
      <InteractiveBarChart
        label="Active users / 30d"
        tone="blue"
        points={[
          { date: "2026-10-01", value: null },
          { date: "2026-10-02", value: 8, observed: false },
          { date: "2026-10-03", value: 0, observed: true },
          { date: "2026-10-04", value: 10, observed: true },
        ]}
      />,
    );

    const bars = container.querySelectorAll(".recharts-bar-rectangle path");
    expect(bars).toHaveLength(2);
    expect(Number(bars[0]!.getAttribute("height"))).toBe(3);
    expect(Number(bars[1]!.getAttribute("height"))).toBeGreaterThan(3);
  });
});
