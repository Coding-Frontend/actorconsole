"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, ChartTooltip } from "@/components/charts/chart-system";
import { cn } from "@/lib/utils";

interface DailyUsageCost {
  date: string;
  usageCostUsd: number;
  runs: number;
}

interface UsageCostChartProps {
  data: DailyUsageCost[];
  className?: string;
}

type RangeKey = "7d" | "30d" | "90d" | "12m";

const RANGES: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function UsageCostChart({ data, className }: UsageCostChartProps) {
  const [range, setRange] = useState<RangeKey>("90d");
  const rangeDays = RANGES.find((item) => item.key === range)?.days ?? 30;

  const filtered = useMemo(() => {
    const values = new Map(data.map((point) => [point.date.slice(0, 10), point]));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const points: DailyUsageCost[] = [];
    for (let offset = rangeDays - 1; offset >= 0; offset -= 1) {
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() - offset);
      const date = utcDay(day);
      points.push(values.get(date) ?? { date, usageCostUsd: 0, runs: 0 });
    }
    return points;
  }, [data, rangeDays]);

  const totalUsageCost = filtered.reduce((sum, point) => sum + point.usageCostUsd, 0);
  const totalRuns = filtered.reduce((sum, point) => sum + point.runs, 0);
  const avgDaily = totalUsageCost / filtered.length;
  const midpoint = Math.floor(filtered.length / 2);
  const previousCost = filtered
    .slice(0, midpoint)
    .reduce((sum, point) => sum + point.usageCostUsd, 0);
  const currentCost = filtered.slice(midpoint).reduce((sum, point) => sum + point.usageCostUsd, 0);
  const trend = previousCost > 0 ? ((currentCost - previousCost) / previousCost) * 100 : null;
  const hasData = totalUsageCost > 0 || totalRuns > 0;
  const series = [
    {
      key: "usageCostUsd",
      label: "Usage cost",
      color: "var(--color-signal-orange)",
      format: { unit: "currency" as const, currency: "USD" },
    },
    {
      key: "runs",
      label: "Runs",
      color: "var(--color-signal-blue)",
      format: { unit: "compact" as const },
    },
  ] as const;

  const formatXAxis = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`);
    return date.toLocaleDateString("en-US", {
      month: range === "7d" ? undefined : "short",
      weekday: range === "7d" ? "short" : undefined,
      day: range === "12m" ? undefined : "numeric",
      timeZone: "UTC",
    });
  };

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1" aria-label="Usage chart range">
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              aria-pressed={range === key}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                range === key
                  ? "bg-signal-orange text-ink"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm sm:flex sm:gap-6">
          <Summary
            label="Cost"
            value={formatCurrency(totalUsageCost)}
            className="text-signal-orange"
          />
          <Summary label="Avg / day" value={formatCurrency(avgDaily)} />
          <Summary
            label="Cost change"
            value={trend === null ? "—" : `${trend > 0 ? "+" : ""}${trend.toFixed(1)}%`}
            className={
              trend === null || trend === 0
                ? "text-muted-foreground"
                : trend > 0
                  ? "text-destructive"
                  : "text-signal-green"
            }
          />
        </div>
      </div>

      <div className="min-h-72 w-full min-w-0">
        <ChartFrame
          ariaLabel="Usage cost and runs by UTC day"
          series={series}
          status={hasData ? "ready" : "empty"}
          statusMessage="No synchronized usage data for this period."
          options={{ compact: true }}
          chartClassName="h-72 min-w-0"
        >
          {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filtered} margin={{ top: 8, right: 2, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="usageCostFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-signal-orange)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-signal-orange)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.45} />
                <XAxis
                  dataKey="date"
                  hide={!axisLabelsVisible}
                  tickFormatter={formatXAxis}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={36}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                />
                <YAxis
                  yAxisId="cost"
                  hide={!axisLabelsVisible}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(value) => formatCurrency(Number(value))}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                />
                <YAxis yAxisId="runs" orientation="right" hide />
                <Tooltip
                  content={
                    <ChartTooltip
                      series={series}
                      labelFormatter={(value) =>
                        new Date(`${String(value)}T00:00:00Z`).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })
                      }
                    />
                  }
                />
                <Bar
                  yAxisId="runs"
                  dataKey="runs"
                  name="Runs"
                  hide={!visibleSeries.has("runs")}
                  fill="var(--color-signal-blue)"
                  fillOpacity={0.28}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={14}
                  label={
                    dataLabelsVisible
                      ? { fill: "var(--color-foreground)", fontSize: 10, position: "top" }
                      : false
                  }
                />
                <Area
                  yAxisId="cost"
                  type="monotone"
                  dataKey="usageCostUsd"
                  name="Usage cost"
                  hide={!visibleSeries.has("usageCostUsd")}
                  stroke="var(--color-signal-orange)"
                  strokeWidth={2.5}
                  fill="url(#usageCostFill)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  label={
                    dataLabelsVisible ? { fill: "var(--color-foreground)", fontSize: 10 } : false
                  }
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartFrame>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span>{totalRuns.toLocaleString()} runs in this period</span>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="text-right">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</p>
      <p className={cn("font-bold tabular-nums", className)}>{value}</p>
    </div>
  );
}
