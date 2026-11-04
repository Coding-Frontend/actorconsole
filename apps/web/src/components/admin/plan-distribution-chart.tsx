"use client";

import { ChartJsChart } from "@/components/charts/chartjs-chart";
import { ChartFrame } from "@/components/charts/chart-system";
import { formatNumber } from "@/lib/utils";

export function PlanDistributionChart({
  free,
  pro,
  total,
}: {
  free: number;
  pro: number;
  total: number;
}) {
  const data = [
    { plan: "FREE", count: free, color: "var(--color-signal-blue)" },
    { plan: "PRO", count: pro, color: "var(--color-signal-orange)" },
  ].map((item) => ({ ...item, percentage: Math.round((item.count / Math.max(total, 1)) * 100) }));
  const series = [
    {
      key: "percentage",
      label: "Workspace share",
      color: "var(--color-signal-blue)",
      colorKey: "color",
      format: { unit: "percent" as const },
    },
  ];

  return (
    <div className="space-y-4">
      <ChartFrame
        ariaLabel="Workspace plan distribution"
        series={series}
        status={total > 0 ? "ready" : "empty"}
        statusMessage="No workspaces are available yet."
        options={{ showSeriesControls: false, allowAxisLabels: false, allowDataLabels: false }}
        chartClassName="h-40"
      >
        {(state) => (
          <ChartJsChart
            ariaLabel="Workspace plan distribution"
            data={data}
            xKey="plan"
            series={series}
            type="bar"
            horizontal
            state={state}
            showDataLabels
            yAxis={{ min: 0, max: 100, formatValue: (value) => `${value}%` }}
          />
        )}
      </ChartFrame>
      <dl className="grid grid-cols-2 gap-4">
        {data.map((item) => (
          <div key={item.plan}>
            <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">
              {item.plan}
            </dt>
            <dd className="mt-1 text-xs text-muted-foreground">
              {formatNumber(item.count)} workspaces · {item.percentage}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
