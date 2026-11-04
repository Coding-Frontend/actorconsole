import { describe, expect, it, vi } from "vitest";
import { loadChartRenderer } from "./load-chart-renderer";
vi.mock("./chartjs-renderer", () => ({ ChartJsRenderer: () => null }));

describe("chart renderer download", () => {
  it("shares the same in-flight and completed import across charts", async () => {
    const first = loadChartRenderer();
    const second = loadChartRenderer();
    expect(first).toBe(second);
    expect(await first).toBeTypeOf("function");
    expect(loadChartRenderer()).toBe(first);
  });
});
