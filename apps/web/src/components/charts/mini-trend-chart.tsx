"use client";

import { Line, LineChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
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

type DotProps = {
  cx?: number;
  cy?: number;
  index?: number;
};

/** A deliberately quiet chart for marketing product visuals. It still uses
 * the shared Recharts frame, but keeps controls out of small decorative cards. */
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
      {({ visibleSeries }) => (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#26364d" strokeWidth={1} vertical={false} />
            <XAxis dataKey="index" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Line
              type="monotone"
              dataKey="value"
              hide={!visibleSeries.has("value")}
              stroke={primaryColor}
              strokeWidth={3}
              strokeLinecap="round"
              dot={({ cx, cy, index, key }) => (
                <SelectableDot
                  key={key}
                  cx={cx}
                  cy={cy}
                  index={index}
                  selectedIndex={selectedIndex}
                  primaryColor={primaryColor}
                  selectedColor={selectedColor}
                />
              )}
              activeDot={false}
              isAnimationActive={false}
            />
            {comparisonValues ? (
              <Line
                type="monotone"
                dataKey="comparison"
                hide={!visibleSeries.has("comparison")}
                stroke={comparisonColor}
                strokeWidth={2}
                strokeDasharray="7 6"
                strokeLinecap="round"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );

  function SelectableDot({
    cx,
    cy,
    index,
    selectedIndex: activeIndex,
    primaryColor: color,
    selectedColor: activeColor,
  }: DotProps & {
    selectedIndex: number;
    primaryColor: string;
    selectedColor: string;
  }) {
    if (cx == null || cy == null) return null;
    const pointIndex = index ?? -1;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={pointIndex === activeIndex ? 5 : 3}
        fill={pointIndex === activeIndex ? activeColor : color}
        onClick={() => onSelect?.(pointIndex)}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onKeyDown={(event) => {
          if (onSelect && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onSelect(pointIndex);
          }
        }}
      />
    );
  }
}
