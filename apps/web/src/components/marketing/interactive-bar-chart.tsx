"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, ChartTooltip } from "@/components/charts/chart-system";

export type InteractiveBarPoint = {
  date: string;
  value: number | null;
  observed?: boolean;
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
    <div
      className="border-border bg-muted/10 min-h-64 w-full border p-2 sm:p-3"
      role="img"
      aria-label={`${label} by UTC day. Hover or focus the chart to inspect each value.`}
    >
      <ChartFrame
        ariaLabel={`${label} by UTC day`}
        series={series}
        status={points.length ? "ready" : "empty"}
        statusMessage="No UTC-day observations are available."
        options={{ showSeriesControls: false, compact: true }}
        chartClassName="h-56 min-w-0"
      >
        {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeDasharray="3 5"
                vertical={false}
                opacity={0.65}
              />
              <XAxis
                dataKey="date"
                hide={!axisLabelsVisible}
                axisLine={false}
                tickLine={false}
                minTickGap={26}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickFormatter={formatDate}
              />
              <YAxis
                hide={!axisLabelsVisible}
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                width={54}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickFormatter={compact}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--accent))", opacity: 0.35 }}
                content={
                  <ChartTooltip
                    series={series}
                    labelFormatter={(value) => formatLongDate(String(value))}
                  />
                }
              />
              <Bar
                dataKey="value"
                name={label}
                hide={!visibleSeries.has("value")}
                fill={toneColors[tone]}
                maxBarSize={44}
                // Keep captured zeros visible without drawing bars for missing days.
                minPointSize={(_value, index) => (data[index]?.value == null ? 0 : 3)}
                radius={[3, 3, 0, 0]}
                label={
                  dataLabelsVisible
                    ? { fill: "var(--color-foreground)", fontSize: 10, position: "top" }
                    : false
                }
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
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
