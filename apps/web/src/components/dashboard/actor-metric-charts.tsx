"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, ChartTooltip } from "@/components/charts/chart-system";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface ActorMetricSnapshot {
  id: string;
  capturedAt: string;
  runs30d: number | null;
  monthlyUsers: number | null;
  usersTotal: number | null;
}

export interface ActorUsageDay {
  date: string;
  runs: number;
}

export interface ActorMetricAnalytics {
  runStatistics?: {
    dailyStats?: Record<string, { TOTAL?: number }>;
  };
  userCountStatistics?: unknown;
}

export interface ActorMetricPoint {
  date: string;
  label: string;
  runs: number | null;
  activeUsers: number | null;
  totalUsers: number | null;
}

type DailyCounts = Pick<ActorMetricPoint, "runs" | "activeUsers" | "totalUsers">;
type TrendMode = "absolute" | "cumulative";

type ActorMetricDisplayPoint = ActorMetricPoint & {
  displayRuns: number | null;
  displayActiveUsers: number | null;
  displayTotalUsers: number | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const ACTIVE_USER_KEYS = [
  "activeusers",
  "activeusercount",
  "monthlyusers",
  "users30days",
  "usercount",
  "uniqusers",
];
const TOTAL_USER_KEYS = ["totalusers", "totalusercount", "cumulativeusers", "allusers"];

const METRICS = [
  {
    key: "runs",
    title: "Runs · 90 days",
    description: "Runs completed on each actual date across the historical window",
    color: "var(--color-signal-orange)",
  },
  {
    key: "activeUsers",
    title: "Active users · 90 days",
    description: "Observed user activity by day",
    color: "var(--color-signal-green)",
  },
  {
    key: "totalUsers",
    title: "Total users · 90 days",
    description: "Cumulative users at each sync",
    color: "var(--color-signal-blue)",
  },
] as const;

function hasDailyRunObservations(
  usageDaily: ActorUsageDay[],
  metricAnalytics: ActorMetricAnalytics[],
): boolean {
  if (usageDaily.some((day) => Number.isFinite(day.runs))) return true;
  return metricAnalytics.some((analytics) =>
    Object.values(analytics.runStatistics?.dailyStats ?? {}).some(
      (stats) => finiteNumber(stats.TOTAL) !== null,
    ),
  );
}

function compact(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueForKeys(record: Record<string, unknown>, keys: string[]): number | null {
  for (const [key, value] of Object.entries(record)) {
    if (!keys.includes(normalizedKey(key))) continue;
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function dateFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ["date", "day", "timestamp", "createdAt", "capturedAt"]) {
    const value = record[key];
    if (typeof value === "string" && DATE_PATTERN.test(value)) return value.slice(0, 10);
  }
  return null;
}

/** Normalize the wrapped, date-keyed, and array payloads returned by Console. */
export function extractUserCountDays(value: unknown): Map<string, Partial<DailyCounts>> {
  const days = new Map<string, Partial<DailyCounts>>();
  const visit = (node: unknown, context: string, depth: number) => {
    if (depth > 6 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, context, depth + 1));
      return;
    }

    const record = node as Record<string, unknown>;
    const recordDate = dateFromRecord(record);
    if (recordDate) {
      let activeUsers = valueForKeys(record, ACTIVE_USER_KEYS);
      const totalUsers = valueForKeys(record, TOTAL_USER_KEYS);
      if (activeUsers === null && context.includes("user")) {
        activeUsers = finiteNumber(record.value ?? record.count ?? record.y);
      }
      if (activeUsers !== null || totalUsers !== null) {
        days.set(recordDate, {
          ...(activeUsers !== null ? { activeUsers } : {}),
          ...(totalUsers !== null ? { totalUsers } : {}),
        });
      }
    }

    for (const [key, child] of Object.entries(record)) {
      if (DATE_PATTERN.test(key) && child && typeof child === "object" && !Array.isArray(child)) {
        const dailyRecord = child as Record<string, unknown>;
        const activeUsers = valueForKeys(dailyRecord, ACTIVE_USER_KEYS);
        const totalUsers = valueForKeys(dailyRecord, TOTAL_USER_KEYS);
        const contextValue = context.includes("user")
          ? finiteNumber(dailyRecord.value ?? dailyRecord.count ?? dailyRecord.y)
          : null;
        if (activeUsers !== null || totalUsers !== null || contextValue !== null) {
          days.set(key.slice(0, 10), {
            ...(activeUsers !== null || contextValue !== null
              ? { activeUsers: activeUsers ?? contextValue! }
              : {}),
            ...(totalUsers !== null ? { totalUsers } : {}),
          });
        }
      }
      visit(child, `${context}.${normalizedKey(key)}`, depth + 1);
    }
  };
  visit(value, "users", 0);
  return days;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildActorMetricPoints({
  snapshots,
  usageDaily,
  metricAnalytics,
  now = new Date(),
  windowDays = 90,
}: {
  snapshots: ActorMetricSnapshot[];
  usageDaily: ActorUsageDay[];
  metricAnalytics: ActorMetricAnalytics[];
  now?: Date;
  windowDays?: number;
}): ActorMetricPoint[] {
  const observed = new Map<string, Partial<DailyCounts>>();
  const hasDailyRuns = hasDailyRunObservations(usageDaily, metricAnalytics);
  const mergeDay = (date: string, values: Partial<DailyCounts>) => {
    observed.set(date, { ...observed.get(date), ...values });
  };

  for (const day of usageDaily) mergeDay(utcDay(new Date(day.date)), { runs: day.runs });
  for (const analytics of metricAnalytics) {
    for (const [date, stats] of Object.entries(analytics.runStatistics?.dailyStats ?? {})) {
      const runs = finiteNumber(stats.TOTAL);
      if (runs !== null) mergeDay(date.slice(0, 10), { runs });
    }
    for (const [date, values] of extractUserCountDays(analytics.userCountStatistics)) {
      mergeDay(date, values);
    }
  }

  const latestSnapshotByDay = new Map<string, ActorMetricSnapshot>();
  for (const snapshot of snapshots) {
    const date = utcDay(new Date(snapshot.capturedAt));
    const current = latestSnapshotByDay.get(date);
    if (!current || Date.parse(snapshot.capturedAt) > Date.parse(current.capturedAt)) {
      latestSnapshotByDay.set(date, snapshot);
    }
  }
  for (const [date, snapshot] of latestSnapshotByDay) {
    mergeDay(date, {
      ...(!hasDailyRuns && snapshot.runs30d !== null ? { runs: snapshot.runs30d } : {}),
      ...(snapshot.monthlyUsers !== null ? { activeUsers: snapshot.monthlyUsers } : {}),
      ...(snapshot.usersTotal !== null ? { totalUsers: snapshot.usersTotal } : {}),
    });
  }

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, windowDays - 1));
  const points: ActorMetricPoint[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = utcDay(cursor);
    const values = observed.get(date);
    points.push({
      date,
      label: cursor.toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      // A snapshot represents one observed UTC day. Carrying it into later
      // empty dates turns a single sync into a convincing but false trend.
      runs: values?.runs ?? null,
      activeUsers: values?.activeUsers ?? null,
      totalUsers: values?.totalUsers ?? null,
    });
  }
  return points;
}

export function buildActorMetricDisplayPoints(
  points: ActorMetricPoint[],
  mode: TrendMode,
  hasDailyRuns: boolean,
): ActorMetricDisplayPoint[] {
  let cumulativeRuns = 0;
  let cumulativeActiveUsers = 0;
  return points.map((point) => {
    if (point.runs != null && hasDailyRuns) cumulativeRuns += point.runs;
    if (point.activeUsers != null) cumulativeActiveUsers += point.activeUsers;
    return {
      ...point,
      // Rolling run totals already represent a moving 30-day window. Summing
      // them would count the same run on every saved snapshot.
      displayRuns:
        point.runs == null || mode === "absolute" || !hasDailyRuns ? point.runs : cumulativeRuns,
      // This is deliberately labelled as observed activity in the UI; it is
      // not a de-duplicated unique-user total.
      displayActiveUsers:
        point.activeUsers == null || mode === "absolute"
          ? point.activeUsers
          : cumulativeActiveUsers,
      // Apify's total-user series is already cumulative at each observation.
      displayTotalUsers: point.totalUsers,
    };
  });
}

export function ActorMetricCharts({
  snapshots,
  usageDaily = [],
  metricAnalytics = [],
}: {
  snapshots: ActorMetricSnapshot[];
  usageDaily?: ActorUsageDay[];
  metricAnalytics?: ActorMetricAnalytics[];
}) {
  const [mode, setMode] = useState<TrendMode>("absolute");
  const points = useMemo(
    () => buildActorMetricPoints({ snapshots, usageDaily, metricAnalytics }),
    [metricAnalytics, snapshots, usageDaily],
  );
  const usesRollingRunsFallback = !hasDailyRunObservations(usageDaily, metricAnalytics);
  const displayPoints = useMemo(
    () => buildActorMetricDisplayPoints(points, mode, !usesRollingRunsFallback),
    [mode, points, usesRollingRunsFallback],
  );

  return (
    <section aria-labelledby="actor-trends-heading" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="actor-trends-heading" className="text-base font-semibold">
            Actor trends
          </h3>
          <p className="text-muted-foreground text-xs">
            Daily Apify analytics with private run history and saved snapshots as fallbacks.
          </p>
        </div>
        <div
          className="flex gap-1 self-start rounded-sm border p-1"
          role="group"
          aria-label="Actor trend display"
        >
          <Button
            size="sm"
            variant={mode === "absolute" ? "secondary" : "ghost"}
            onClick={() => setMode("absolute")}
          >
            Absolute
          </Button>
          <Button
            size="sm"
            variant={mode === "cumulative" ? "secondary" : "ghost"}
            onClick={() => setMode("cumulative")}
          >
            Cumulative
          </Button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {METRICS.map((metric) => {
          const displayKey =
            metric.key === "runs"
              ? "displayRuns"
              : metric.key === "activeUsers"
                ? "displayActiveUsers"
                : "displayTotalUsers";
          const values = displayPoints
            .map((point) => point[displayKey])
            .filter((value): value is number => value !== null);
          const latest = values.at(-1) ?? null;
          const total =
            metric.key === "runs" && !usesRollingRunsFallback
              ? values.reduce((sum, value) => sum + value, 0)
              : latest;
          const title =
            metric.key === "runs" && usesRollingRunsFallback ? "Rolling 30-day runs" : metric.title;
          const description =
            metric.key === "runs" && usesRollingRunsFallback
              ? "Saved Apify 30-day totals at each sync; daily run history is still syncing"
              : mode === "cumulative" && metric.key === "activeUsers"
                ? "Cumulative observed active-user days; repeat users are not de-duplicated"
                : metric.description;
          return (
            <Card key={metric.key} className="min-w-0 overflow-hidden">
              <CardHeader className="space-y-1 pb-2">
                <CardTitle className="flex items-end justify-between gap-3 text-sm">
                  <span>{title}</span>
                  <span className="text-xl tabular-nums">
                    {total === null ? "—" : compact(total)}
                  </span>
                </CardTitle>
                <p className="text-muted-foreground text-xs">{description}</p>
              </CardHeader>
              <CardContent className="px-3 pb-4 sm:px-4">
                {values.length === 0 ? (
                  <div className="border-border/60 bg-muted/15 text-muted-foreground flex h-52 items-center justify-center rounded-md border border-dashed px-6 text-center text-xs">
                    This metric will appear after the connected Apify credential completes a sync.
                  </div>
                ) : values.length === 1 ? (
                  <div className="border-border/60 bg-muted/15 flex h-52 flex-col items-center justify-center rounded-md border border-dashed px-6 text-center">
                    <p className="font-semibold tabular-nums">{compact(values[0]!)}</p>
                    <p className="text-muted-foreground mt-2 max-w-xs text-xs leading-5">
                      Trend baseline is forming. A multi-day chart appears after the next daily
                      catalog or workspace snapshot.
                    </p>
                  </div>
                ) : (
                  <div className="bg-muted/10 min-h-52 min-w-0 rounded-md px-1 pt-3">
                    <ChartFrame
                      ariaLabel={`${title} trend`}
                      series={[
                        {
                          key: displayKey,
                          label:
                            mode === "cumulative" && metric.key !== "totalUsers"
                              ? `Cumulative ${metric.key === "activeUsers" ? "active-user days" : "runs"}`
                              : title,
                          color: metric.color,
                          format: { unit: "compact" },
                        },
                      ]}
                      options={{ showSeriesControls: false, compact: true }}
                      chartClassName="h-52 min-w-0"
                    >
                      {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={displayPoints}
                            margin={{ top: 4, right: 6, left: -18, bottom: 0 }}
                          >
                            <CartesianGrid
                              vertical={false}
                              stroke="hsl(var(--border))"
                              strokeOpacity={0.55}
                            />
                            <XAxis
                              dataKey="label"
                              hide={!axisLabelsVisible}
                              axisLine={false}
                              tickLine={false}
                              interval="preserveStartEnd"
                              minTickGap={38}
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            />
                            <YAxis
                              hide={!axisLabelsVisible}
                              axisLine={false}
                              tickLine={false}
                              width={44}
                              tickFormatter={compact}
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            />
                            <Tooltip
                              cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                              content={
                                <ChartTooltip
                                  series={[
                                    {
                                      key: displayKey,
                                      label: title,
                                      color: metric.color,
                                      format: { unit: "compact" },
                                    },
                                  ]}
                                  labelFormatter={(_, payload) =>
                                    String(
                                      (payload[0]?.payload as ActorMetricDisplayPoint | undefined)
                                        ?.date ?? "",
                                    )
                                  }
                                />
                              }
                            />
                            <Bar
                              dataKey={displayKey}
                              stroke={metric.color}
                              fill={metric.color}
                              hide={!visibleSeries.has(displayKey)}
                              fillOpacity={0.72}
                              maxBarSize={18}
                              radius={[3, 3, 0, 0]}
                              label={
                                dataLabelsVisible
                                  ? {
                                      fill: "var(--color-foreground)",
                                      fontSize: 10,
                                      position: "top",
                                    }
                                  : false
                              }
                              isAnimationActive={false}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </ChartFrame>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
