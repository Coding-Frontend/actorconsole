import { getLogger } from "./logger.js";

type Labels = Record<string, string | number | boolean | undefined>;
interface MetricValue { value: number; labels: Record<string, string> }

const counters = new Map<string, MetricValue>();
const histograms = new Map<string, { count: MetricValue; sum: MetricValue; buckets: Map<string, MetricValue> }>();
const log = getLogger("shared:metrics");

function normalizeLabels(labels: Labels): Record<string, string> {
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key.replace(/[^a-zA-Z0-9_]/g, "_"), String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')]),
  );
}

function labelKey(labels: Record<string, string>): string {
  return Object.entries(labels).map(([key, value]) => `${key}="${value}"`).join(",");
}

function add(map: Map<string, MetricValue>, name: string, labels: Labels, value: number) {
  const normalized = normalizeLabels(labels);
  const key = `${name}|${labelKey(normalized)}`;
  const current = map.get(key);
  if (current) current.value += value;
  else map.set(key, { value, labels: normalized });
}

export function incrementMetric(name: string, labels: Labels = {}, value = 1): void {
  add(counters, name, labels, value);
}

export function observeMetric(name: string, value: number, labels: Labels = {}, buckets = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]) {
  const normalized = normalizeLabels(labels);
  const key = `${name}|${labelKey(normalized)}`;
  const current = histograms.get(key) ?? {
    count: { value: 0, labels: normalized },
    sum: { value: 0, labels: normalized },
    buckets: new Map<string, MetricValue>(),
  };
  current.count.value += 1;
  current.sum.value += value;
  for (const bucket of buckets) {
    if (value <= bucket) {
      const existing = current.buckets.get(String(bucket));
      if (existing) existing.value += 1;
      else current.buckets.set(String(bucket), { value: 1, labels: { ...normalized, le: String(bucket) } });
    }
  }
  const infinity = current.buckets.get("+Inf");
  if (infinity) infinity.value += 1;
  else current.buckets.set("+Inf", { value: 1, labels: { ...normalized, le: "+Inf" } });
  histograms.set(key, current);
}

export function metricsText(): string {
  const lines: string[] = [];
  for (const [key, metric] of counters) {
    const [name] = key.split("|", 1);
    lines.push(`${name}{${labelKey(metric.labels)}} ${metric.value}`);
  }
  for (const [key, metric] of histograms) {
    const [name] = key.split("|", 1);
    lines.push(`${name}_count{${labelKey(metric.count.labels)}} ${metric.count.value}`);
    lines.push(`${name}_sum{${labelKey(metric.sum.labels)}} ${metric.sum.value}`);
    for (const bucket of metric.buckets.values()) {
      lines.push(`${name}_bucket{${labelKey(bucket.labels)}} ${bucket.value}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
}

export function logMetricError(err: unknown): void {
  log.warn({ err }, "Metrics recording failed");
}
