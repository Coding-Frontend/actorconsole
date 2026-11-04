"use client";

import { ChartJsChart } from "@/components/charts/chartjs-chart";
import { ChartFrame } from "@/components/charts/chart-system";
import { formatINR, formatNumber } from "@/lib/utils";

interface Props {
  data: { x: string; y: number }[];
  valueFormatter?: "inr" | "number";
  height?: number;
}

export function Sparkline({ data, valueFormatter, height = 200 }: Props) {
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
      {(state) => (
        <ChartJsChart
          ariaLabel="Metric trend"
          data={data}
          xKey="x"
          series={series}
          type="area"
          state={state}
          height={height}
          xLabelFormatter={(value) => value.slice(5)}
          yAxis={{ formatValue: format }}
        />
      )}
    </ChartFrame>
  );
}
