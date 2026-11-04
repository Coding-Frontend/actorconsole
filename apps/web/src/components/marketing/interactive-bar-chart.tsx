"use client";

import { ChartJsChart } from "@/components/charts/chartjs-chart";
import { ChartFrame } from "@/components/charts/chart-system";

export type InteractiveBarPoint = {
  date: string;
  value: number | null;
  observed?: boolean;
  coverage?: { known: number; total: number };
};

const toneColors = {
  blue: "var(--color-signal-blue)",
  orange: "var(--color-signal-orange)",
  green: "var(--color-signal-green)",
} as const;

export function InteractiveBarChart({
  points,
  label,
  tone,
}: {
  points: InteractiveBarPoint[];
  label: string;
  tone: keyof typeof toneColors;
}) {
  const data = points.map((point) => ({
    date: point.date,
    value: point.observed === false ? null : point.value,
    coverage: point.coverage,
  }));
  const series = [
    {
      key: "value",
      label,
      color: toneColors[tone],
      format: { unit: "number" as const },
    },
  ] as const;

  return (
    <div className="min-h-64 w-full border border-border bg-muted/10 p-2 sm:p-3">
      <ChartFrame
        ariaLabel={`${label} by UTC day`}
        series={series}
        status={points.length ? "ready" : "empty"}
        statusMessage="No UTC-day observations are available."
        options={{ showSeriesControls: false, compact: true }}
        chartClassName="h-56 min-w-0"
      >
        {(state) => (
          <ChartJsChart
            ariaLabel={`${label} by UTC day. Hover or focus the chart to inspect each value.`}
            data={data}
            xKey="date"
            series={series.map((item) => ({ ...item, minBarLength: 3 }))}
            type="bar"
            state={state}
            xLabelFormatter={formatDate}
            yAxis={{ formatValue: compact, integer: true }}
            tooltipTitle={(point) => {
              const coverage = point.coverage;
              const partial = coverage && coverage.known < coverage.total;
              return `${formatLongDate(point.date)}${partial ? ` · Partial: ${coverage.known}/${coverage.total} Actors` : ""}`;
            }}
          />
        )}
      </ChartFrame>
    </div>
  );
}

function compact(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatLongDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}
