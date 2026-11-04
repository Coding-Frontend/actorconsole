"use client";

import { ChartJsChart } from "@/components/charts/chartjs-chart";
import { ChartFrame } from "@/components/charts/chart-system";
import { cn } from "@/lib/utils";

type MiniTrendChartProps = {
  values: readonly number[];
  comparisonValues?: readonly number[];
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  primaryColor?: string;
  comparisonColor?: string;
  selectedColor?: string;
  ariaLabel: string;
  className?: string;
};

/** A deliberately quiet chart for marketing product visuals. It still uses
 * the shared chart frame, but keeps controls out of small decorative cards. */
export function MiniTrendChart({
  values,
  comparisonValues,
  selectedIndex = values.length - 1,
  onSelect,
  primaryColor = "#4f8cff",
  comparisonColor = "#7b8798",
  selectedColor = "#ff9a67",
  ariaLabel,
  className,
}: MiniTrendChartProps) {
  const data = values.map((value, index) => ({
    index,
    value,
    comparison: comparisonValues?.[index] ?? null,
  }));
  const series = [
    { key: "value", label: "This period", color: primaryColor },
    ...(comparisonValues ? [{ key: "comparison", label: "Compare", color: comparisonColor }] : []),
  ];

  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      series={series}
      status={data.length ? "ready" : "empty"}
      statusMessage="No trend observations are available."
      options={{
        showSeriesControls: false,
        allowAxisLabels: false,
        allowDataLabels: false,
        compact: true,
      }}
      className={cn("h-full", className)}
      chartClassName="h-full min-w-0"
    >
      {(state) => (
        <ChartJsChart
          ariaLabel={ariaLabel}
          data={data}
          xKey="index"
          series={series.map((item) => ({
            ...item,
            dashed: item.key === "comparison",
            pointRadius: item.key === "value" ? 3 : 0,
          }))}
          state={{ ...state, axisLabelsVisible: false }}
          selectedIndex={selectedIndex}
          selectedColor={selectedColor}
          onSelect={onSelect}
          yAxis={{ beginAtZero: false }}
        />
      )}
    </ChartFrame>
  );
}
