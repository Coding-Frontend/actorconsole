import type { PublicCompareItem } from "./public-comparison-items";

export const comparisonColors = ["#e8794d", "#6b94e6", "#45aa97", "#aa87d8", "#c29c48"];

export function numericMetric(item: PublicCompareItem, key: string) {
  const value = item.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function metricChartData(items: PublicCompareItem[], key: string) {
  return items.map((item, index) => ({
    name: item.title,
    id: item.id,
    value: numericMetric(item, key),
    color: comparisonColors[index % comparisonColors.length],
  }));
}

export function historyChartData(items: PublicCompareItem[], metric: "users" | "runs") {
  const dates = [
    ...new Set(items.flatMap((item) => item.history?.map((point) => point.date) ?? [])),
  ].sort();
  const histories = items.map(
    (item) => new Map(item.history?.map((point) => [point.date, point[metric]])),
  );
  return dates.map((date) => ({
    date,
    ...Object.fromEntries(
      histories.map((history, index) => {
        const value = history.get(date);
        return [
          `series${index}`,
          typeof value === "number" && Number.isFinite(value) ? value : null,
        ];
      }),
    ),
  }));
}

export function metricLeader(items: PublicCompareItem[], key: string, better: "higher" | "lower") {
  const values = items
    .map((item) => numericMetric(item, key))
    .filter((value): value is number => value !== null);
  if (values.length < 2 || new Set(values).size === 1) return null;
  return better === "higher" ? Math.max(...values) : Math.min(...values);
}
