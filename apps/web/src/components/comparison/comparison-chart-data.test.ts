import { describe, expect, it } from "vitest";
import { historyChartData, metricChartData, metricLeader } from "./comparison-chart-data";
import type { PublicCompareItem } from "./public-comparison-items";

const base: PublicCompareItem = {
  id: "a",
  kind: "builder",
  username: "a",
  title: "A",
  subtitle: "@a",
  window: 30,
  metrics: {},
};
describe("comparison chart data", () => {
  it("keeps real zero values and unavailable observations distinct", () => {
    const data = metricChartData(
      [
        { ...base, metrics: { users: 0 } },
        { ...base, id: "b", metrics: { users: null } },
        { ...base, id: "c", metrics: { users: NaN } },
      ],
      "users",
    );
    expect(data.map((point) => point.value)).toEqual([0, null, null]);
  });
  it("aligns history dates without filling gaps or treating period totals as time series", () => {
    const data = historyChartData(
      [
        {
          ...base,
          history: [
            { date: "2026-10-02", users: 10, runs: 100 },
            { date: "2026-10-04", users: null, runs: null },
          ],
        },
        { ...base, id: "b", history: [{ date: "2026-10-03", users: 0, runs: 0 }] },
      ],
      "users",
    );
    expect(data).toEqual([
      { date: "2026-10-02", series0: 10, series1: null },
      { date: "2026-10-03", series0: null, series1: 0 },
      { date: "2026-10-04", series0: null, series1: null },
    ]);
    expect(historyChartData([base], "users")).toEqual([]);
  });
  it("highlights only comparable numeric values and uses lower values for ranks", () => {
    expect(
      metricLeader(
        [
          { ...base, metrics: { rank: 10 } },
          { ...base, id: "b", metrics: { rank: 2 } },
        ],
        "rank",
        "lower",
      ),
    ).toBe(2);
    expect(
      metricLeader(
        [
          { ...base, metrics: { users: 0 } },
          { ...base, metrics: { users: null } },
        ],
        "users",
        "higher",
      ),
    ).toBeNull();
    expect(
      metricLeader(
        [
          { ...base, metrics: { users: 5 } },
          { ...base, metrics: { users: 5 } },
        ],
        "users",
        "higher",
      ),
    ).toBeNull();
  });
});
