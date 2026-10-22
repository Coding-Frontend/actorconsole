"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, ChartTooltip } from "@/components/charts/chart-system";
import { formatINR, formatNumber } from "@/lib/utils";

interface Props {
  data: { x: string; y: number }[];
  valueFormatter?: "inr" | "number";
  height?: number;
}

export function Sparkline({ data, valueFormatter, height = 200 }: Props) {
  const gradientId = `spark-fill-${useId().replaceAll(":", "")}`;
  const format = (value: number) => {
    if (valueFormatter === "inr") return formatINR(value);
    if (valueFormatter === "number") return formatNumber(value);
    return String(value);
  };
  const series = [
    {
      key: "y",
      label: "Value",
      color: "var(--color-signal-blue)",
      formatValue: format,
    },
  ] as const;

  return (
    <ChartFrame
      ariaLabel="Metric trend"
      series={series}
      status={data.length ? "ready" : "empty"}
      statusMessage="No metric history is available."
      options={{ showSeriesControls: false, compact: true }}
      chartClassName="min-w-0"
    >
      {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-signal-blue)" stopOpacity={0.32} />
                <stop offset="95%" stopColor="var(--color-signal-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="x"
              hide={!axisLabelsVisible}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: string) => v.slice(5)}
              stroke="hsl(var(--border))"
            />
            <YAxis
              hide={!axisLabelsVisible}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border))"
            />
            <Tooltip content={<ChartTooltip series={series} />} />
            <Area
              type="monotone"
              dataKey="y"
              name="Value"
              hide={!visibleSeries.has("y")}
              stroke="var(--color-signal-blue)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              label={dataLabelsVisible ? { fill: "var(--color-foreground)", fontSize: 10 } : false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
