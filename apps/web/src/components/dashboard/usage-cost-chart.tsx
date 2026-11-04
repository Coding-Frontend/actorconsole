"use client";

import { useMemo, useState } from "react";
import { ChartJsChart } from "@/components/charts/chartjs-chart";
import { ChartFrame } from "@/components/charts/chart-system";
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
          {(state) => (
            <ChartJsChart
              ariaLabel="Usage cost and runs by UTC day"
              data={filtered}
              xKey="date"
              series={series.map((item) => ({
                ...item,
                type: item.key === "runs" ? "bar" : "area",
                axisId: item.key === "runs" ? "runs" : "y",
                maxBarThickness: 14,
              }))}
              state={state}
              xLabelFormatter={formatXAxis}
              tooltipTitle={(point) =>
                new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })
              }
              yAxis={{ formatValue: formatCurrency }}
              additionalAxes={{ runs: { hidden: true, integer: true, position: "right" } }}
            />
          )}
        </ChartFrame>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
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
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-bold tabular-nums", className)}>{value}</p>
    </div>
  );
}
