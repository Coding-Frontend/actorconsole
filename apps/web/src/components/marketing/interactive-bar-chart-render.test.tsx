import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InteractiveBarChart } from "./interactive-bar-chart";
import { MockChart } from "../../../test/chartjs-mock";

vi.mock("chart.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("chart.js")>()),
  Chart: (await import("../../../test/chartjs-mock")).MockChart,
}));

beforeEach(() => {
  MockChart.instances.length = 0;
});
afterEach(cleanup);

describe("observed bar rendering", () => {
  it("leaves missing observations empty while keeping a captured zero visible", () => {
    render(
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

    const dataset = MockChart.instances[0]!.data.datasets[0]!;
    expect(dataset.data).toEqual([null, null, 0, 10]);
    expect(dataset.type).toBe("bar");
    if (dataset.type === "bar") expect(dataset.minBarLength).toBe(3);
  });
});
