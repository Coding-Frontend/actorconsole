import { vi } from "vitest";
import type { ChartConfiguration, ChartOptions } from "chart.js";

type Config = ChartConfiguration<"bar" | "line", (number | null)[], string>;

/** The canvas engine is checked in Playwright; DOM tests exercise the React lifecycle. */
export class MockChart {
  static register = vi.fn();
  static instances: MockChart[] = [];
  data: Config["data"];
  options: ChartOptions<"bar" | "line">;
  update = vi.fn();
  destroy = vi.fn();
  setActiveElements = vi.fn();
  tooltip = { setActiveElements: vi.fn() };

  constructor(
    public canvas: HTMLCanvasElement,
    public config: Config,
  ) {
    this.data = config.data;
    this.options = config.options ?? {};
    MockChart.instances.push(this);
  }

  isDatasetVisible(index: number) {
    return !this.data.datasets[index]?.hidden;
  }

  getDatasetMeta(index: number) {
    return {
      data: this.data.datasets[index]!.data.map((_, pointIndex) => ({
        tooltipPosition: () => ({ x: pointIndex * 20 + 10, y: 20 }),
      })),
    };
  }
}
