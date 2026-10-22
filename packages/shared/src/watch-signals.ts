export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export interface WatchMetrics {
  users30Days: number | null;
  runs30Days: number | null;
  reviewRating: number | null;
  pricing: unknown;
  isPublic: boolean;
  rank: number | null;
}
export function watchSignals(before: WatchMetrics, after: WatchMetrics) {
  const signals: string[] = [];
  for (const [key, label] of [
    ["users30Days", "Active users / 30d"],
    ["runs30Days", "Runs / 30d"],
  ] as const) {
    const a = before[key],
      b = after[key];
    if (a != null && b != null && Math.abs(b - a) >= Math.max(10, a * 0.1))
      signals.push(`${label}: ${a.toLocaleString("en-US")} → ${b.toLocaleString("en-US")}`);
  }
  if (before.rank != null && after.rank != null && before.rank !== after.rank)
    signals.push(`Active-user rank: #${before.rank} → #${after.rank}`);
  if (
    before.pricing != null &&
    after.pricing != null &&
    stableJson(before.pricing) !== stableJson(after.pricing)
  )
    signals.push("Published pricing changed");
  if (
    before.reviewRating != null &&
    after.reviewRating != null &&
    Math.abs(before.reviewRating - after.reviewRating) >= 0.2
  )
    signals.push(`Rating: ${before.reviewRating.toFixed(1)} → ${after.reviewRating.toFixed(1)}`);
  if (before.isPublic && !after.isPublic) signals.push("Actor is no longer public");
  return signals;
}
