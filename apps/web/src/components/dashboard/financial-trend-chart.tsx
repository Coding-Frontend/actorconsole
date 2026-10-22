"use client";

import { useId, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  ChartFrame,
  ChartTooltip,
  type ChartSeriesDefinition,
} from "@/components/charts/chart-system";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { downloadCsv } from "@/components/intelligence/tool-actions";
import type { FinancialDashboardKind } from "@/lib/financial-dashboard";

export interface FinancialTrendPoint {
  period: string;
  runs?: number | null;
  successful?: number | null;
  failed?: number | null;
  directCostUsd?: number | null;
  accountCostUsd?: number | null;
  revenueUsd?: number | null;
  netProfitUsd?: number | null;
}
type Granularity = "day" | "week" | "month";
type MetricKey = Exclude<keyof FinancialTrendPoint, "period">;
const definitions: Record<MetricKey, ChartSeriesDefinition> = {
  runs: { key: "runs", label: "Total runs", color: "var(--color-signal-blue)" },
  successful: { key: "successful", label: "Successful runs", color: "var(--color-signal-green)" },
  failed: { key: "failed", label: "Failed runs", color: "var(--color-signal-orange)" },
  directCostUsd: {
    key: "directCostUsd",
    label: "Actor run cost",
    color: "var(--color-signal-blue)",
  },
  accountCostUsd: {
    key: "accountCostUsd",
    label: "Account spending",
    color: "var(--color-signal-orange)",
  },
  revenueUsd: { key: "revenueUsd", label: "Revenue", color: "var(--color-signal-green)" },
  netProfitUsd: { key: "netProfitUsd", label: "Net profit", color: "var(--color-signal-blue)" },
};
const views: Record<
  FinancialDashboardKind,
  { label: string; keys: MetricKey[]; description: string }[]
> = {
  usage: [
    { label: "Total runs", keys: ["runs"], description: "How often your Actors ran." },
    {
      label: "Successful and failed runs",
      keys: ["successful", "failed"],
      description: "Compare run outcomes. These counts are parts of total runs.",
    },
    { label: "Failed runs", keys: ["failed"], description: "Focus on executions that failed." },
  ],
  costs: [
    {
      label: "Account spending",
      keys: ["accountCostUsd"],
      description:
        "Account charges across Apify services. Actor filters do not change account-wide charges.",
    },
    {
      label: "Actor run cost",
      keys: ["directCostUsd"],
      description: "Execution cost for the selected Actors.",
    },
    {
      label: "Compare both costs",
      keys: ["directCostUsd", "accountCostUsd"],
      description:
        "Account spending includes more than Actor runs. These amounts overlap; do not add them together.",
    },
  ],
  revenue: [
    {
      label: "Revenue and net profit",
      keys: ["revenueUsd", "netProfitUsd"],
      description:
        "Compare reported earnings with profit after allocated Apify costs. External expenses are shown on Profitability.",
    },
    {
      label: "Revenue",
      keys: ["revenueUsd"],
      description: "Reported Actor earnings for the selected scope.",
    },
    {
      label: "Net profit",
      keys: ["netProfitUsd"],
      description:
        "Revenue after allocated Apify costs. External expenses are shown on Profitability.",
    },
  ],
};

export function formatFinancialTrendValue(
  value: number | null | undefined,
  kind: FinancialDashboardKind,
) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  if (kind === "usage") return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value !== 0 && Math.abs(value) < 0.000001) return value < 0 ? "−<$0.000001" : "<$0.000001";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}
export function financialTrendPeriodLabel(period: string, granularity: Granularity, full = false) {
  const date = new Date(`${period.length === 7 ? `${period}-01` : period}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return period;
  const label = date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    ...(granularity !== "month" ? { day: "numeric" } : {}),
    ...(full || granularity === "month" ? { year: "numeric" } : {}),
  });
  return granularity === "week" ? `Week of ${label}` : label;
}

export function FinancialTrendChart({
  kind,
  points,
  granularity,
  mode,
  compare,
  from,
  to,
  selectedDay,
  advancedCount,
  onSettingsChange,
  onInspectDay,
}: {
  kind: FinancialDashboardKind;
  points: FinancialTrendPoint[];
  granularity: Granularity;
  mode: "absolute" | "cumulative";
  compare: boolean;
  from: string;
  to: string;
  selectedDay: string | null;
  advancedCount: number;
  onSettingsChange: (updates: Record<string, string | null>) => void;
  onInspectDay: (day: string | null) => void;
}) {
  const id = useId();
  const [view, setView] = useState("0");
  const [customMetrics, setCustomMetrics] = useState<MetricKey[]>(views[kind][0]!.keys);
  const [style, setStyle] = useState<"line" | "bar">(kind === "usage" ? "line" : "bar");
  const [showValues, setShowValues] = useState(false);
  const choice =
    view === "custom"
      ? {
          label: "Custom metrics",
          keys: customMetrics,
          description: kind === "costs" ? views.costs[2]!.description : views[kind][0]!.description,
        }
      : (views[kind][Number(view)] ?? views[kind][0]!);
  const availableMetrics = [...new Set(views[kind].flatMap((item) => item.keys))];
  const series = choice.keys.map((key) => ({
    ...definitions[key],
    formatValue: (value: number) => formatFinancialTrendValue(value, kind),
  }));
  const hasData = points.some((point) =>
    choice.keys.some((key) => point[key] != null && Number.isFinite(point[key])),
  );
  const labelsAllowed = points.length <= 14;
  const title =
    kind === "usage"
      ? "Actor activity trend"
      : kind === "costs"
        ? "Spending over time"
        : "Revenue and profit trend";
  const chartLabel =
    kind === "usage" ? "Actor activity trend" : kind === "costs" ? "Daily spending trend" : title;
  const settingsCount =
    advancedCount +
    Number(view !== "0") +
    Number(style !== (kind === "usage" ? "line" : "bar")) +
    Number(showValues);
  const selectClass =
    "border-input bg-background text-foreground focus-visible:ring-ring h-10 w-full min-w-0 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";
  const tickColor = "var(--color-muted-foreground)";
  const axisValue = (value: number) =>
    kind === "usage"
      ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
          value,
        )
      : Math.abs(value) >= 1000
        ? `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`
        : formatFinancialTrendValue(value, kind);
  const axes = [
    <CartesianGrid
      key="grid"
      vertical={false}
      stroke="hsl(var(--border) / 0.55)"
      strokeDasharray="3 3"
    />,
    <XAxis
      key="dates"
      dataKey="period"
      tickFormatter={(value) => financialTrendPeriodLabel(String(value), granularity)}
      tick={{ fontSize: 12, fill: tickColor }}
      tickLine={false}
      axisLine={false}
      minTickGap={32}
      interval="preserveStartEnd"
      tickMargin={10}
    />,
    <YAxis
      key="values"
      width={kind === "usage" ? 48 : 76}
      tick={{ fontSize: 12, fill: tickColor }}
      tickLine={false}
      axisLine={false}
      tickFormatter={axisValue}
      allowDecimals={kind !== "usage"}
    />,
    <Tooltip
      key="tooltip"
      content={
        <ChartTooltip
          series={series}
          labelFormatter={(label) =>
            `${financialTrendPeriodLabel(String(label), granularity, true)} · UTC${mode === "cumulative" ? " · Running total" : ""}`
          }
        />
      }
      cursor={{ stroke: tickColor, strokeDasharray: "3 3", fill: "hsl(var(--muted) / 0.35)" }}
    />,
    <ReferenceLine key="baseline" y={0} stroke="hsl(var(--border))" />,
  ];
  function resetChart() {
    setView("0");
    setStyle(kind === "usage" ? "line" : "bar");
    setShowValues(false);
    onSettingsChange({ granularity: null, mode: null, compare: null, day: null, table: null });
  }
  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <p className="text-muted-foreground mt-2 text-sm">
            {granularity === "day" ? "Daily" : granularity === "week" ? "Weekly" : "Monthly"}
            {mode === "cumulative" ? " running total" : " totals"}
            {" · "}
            {from} to {to}
            {" · "}
            {kind === "usage" ? "Runs" : "USD"}
            {" · UTC"}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
          <label className="grid min-w-0 gap-1.5 text-sm sm:w-56">
            <span className="text-muted-foreground">Show</span>
            <select
              className={selectClass}
              aria-label="Chart metric"
              value={view}
              onChange={(event) => setView(event.target.value)}
            >
              {views[kind].map((item, index) => (
                <option key={item.label} value={index}>
                  {item.label}
                </option>
              ))}
              {view === "custom" && <option value="custom">Custom metrics</option>}
            </select>
          </label>
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="outline" className="h-10" aria-label="Advanced chart settings">
                <SlidersHorizontal className="h-4 w-4" /> Advanced
                {settingsCount ? ` (${settingsCount})` : ""}
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={8}
                className="border-border bg-popover text-popover-foreground z-50 max-h-[min(38rem,80dvh)] w-[min(22rem,calc(100vw-2rem))] space-y-4 overflow-y-auto rounded-md border p-5 shadow-lg"
              >
                <h3 className="text-base font-semibold">Chart settings</h3>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">Choose metrics</legend>
                  {availableMetrics.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-signal-blue h-4 w-4"
                        checked={choice.keys.includes(key)}
                        disabled={choice.keys.length === 1 && choice.keys.includes(key)}
                        onChange={(event) => {
                          setCustomMetrics(
                            event.target.checked
                              ? [...choice.keys, key]
                              : choice.keys.filter((item) => item !== key),
                          );
                          setView("custom");
                        }}
                      />
                      {definitions[key].label}
                    </label>
                  ))}
                  <p className="text-muted-foreground text-xs">
                    Keep at least one metric selected.
                  </p>
                </fieldset>
                <label className="grid gap-1.5 text-sm">
                  Group by
                  <select
                    className={selectClass}
                    aria-label="Group results by"
                    value={granularity}
                    onChange={(event) =>
                      onSettingsChange({
                        granularity: event.target.value === "day" ? null : event.target.value,
                        day: null,
                      })
                    }
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  Chart values
                  <select
                    className={selectClass}
                    aria-label="Chart values"
                    value={mode}
                    onChange={(event) =>
                      onSettingsChange({
                        mode: event.target.value === "absolute" ? null : event.target.value,
                      })
                    }
                  >
                    <option value="absolute">Total for each period</option>
                    <option value="cumulative">Running total</option>
                  </select>
                  <span className="text-muted-foreground text-xs">
                    Running total adds each period to the periods before it.
                  </span>
                </label>
                <label className="grid gap-1.5 text-sm">
                  Chart style
                  <select
                    className={selectClass}
                    value={style}
                    onChange={(event) => setStyle(event.target.value as "line" | "bar")}
                  >
                    <option value="line">Lines</option>
                    <option value="bar">Bars</option>
                  </select>
                </label>
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${id}-values`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    Show values on the chart
                    <Switch
                      id={`${id}-values`}
                      checked={showValues && labelsAllowed}
                      disabled={!labelsAllowed}
                      onCheckedChange={setShowValues}
                      aria-label="Show values on the chart"
                    />
                  </label>
                  {!labelsAllowed && (
                    <p className="text-muted-foreground text-xs">
                      Use a shorter range or group by week/month to keep values readable. Exact
                      values are always available below.
                    </p>
                  )}
                </div>
                <label
                  htmlFor={`${id}-compare`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  Compare summaries with previous period
                  <Switch
                    id={`${id}-compare`}
                    checked={compare}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ compare: checked ? null : "false" })
                    }
                    aria-label="Compare summaries with previous period"
                  />
                </label>
                <div className="border-border space-y-2 border-t pt-4">
                  <label htmlFor={`${id}-inspect`} className="grid gap-1.5 text-sm">
                    Inspect Actors on a date
                    <Input
                      id={`${id}-inspect`}
                      type="date"
                      value={selectedDay ?? ""}
                      min={from}
                      max={to}
                      onChange={(event) => onInspectDay(event.target.value || null)}
                      aria-label="Inspect one UTC date"
                    />
                  </label>
                  <p className="text-muted-foreground text-xs">
                    Filters the Actor table below. Dates use UTC.
                  </p>
                  {selectedDay && (
                    <Button variant="ghost" size="sm" onClick={() => onInspectDay(null)}>
                      Clear day
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={resetChart}>
                  <RotateCcw className="h-4 w-4" /> Reset chart settings
                </Button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 max-w-[75ch] text-sm leading-6">
          {choice.description}
        </p>
        <div
          role="list"
          aria-label="Displayed metrics"
          className="mb-4 flex flex-wrap gap-x-5 gap-y-2"
        >
          {series.map((item) => (
            <span key={item.key} role="listitem" className="inline-flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              {item.label}
            </span>
          ))}
        </div>
        <ChartFrame
          ariaLabel={chartLabel}
          series={series}
          status={hasData ? "ready" : "empty"}
          statusMessage="No data is available for this metric in the selected period. Try another metric or date range, or synchronize your workspace. Missing values are not zero."
          options={{ showSeriesControls: false, allowAxisLabels: false, allowDataLabels: false }}
          chartClassName="h-[280px] min-w-0 sm:h-[330px]"
        >
          {() => (
            <ResponsiveContainer width="100%" height="100%" debounce={0}>
              {style === "line" ? (
                <LineChart
                  data={points}
                  accessibilityLayer
                  margin={{ top: 20, right: 16, bottom: 12, left: 0 }}
                >
                  {axes}
                  {series.map((item) => (
                    <Line
                      key={item.key}
                      dataKey={item.key}
                      name={item.label}
                      stroke={item.color}
                      strokeWidth={2}
                      strokeDasharray={
                        series.length > 1 && item.key === series[1]?.key ? "5 3" : undefined
                      }
                      dot={points.length <= 14 ? { r: 3 } : false}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    >
                      {showValues && labelsAllowed && (
                        <LabelList
                          position="top"
                          fill="var(--color-foreground)"
                          fontSize={11}
                          dataKey={item.key}
                          formatter={(value: unknown) =>
                            value == null
                              ? ""
                              : formatFinancialTrendValue(
                                  typeof value === "number" ? value : null,
                                  kind,
                                )
                          }
                        />
                      )}
                    </Line>
                  ))}
                </LineChart>
              ) : (
                <BarChart
                  data={points}
                  accessibilityLayer
                  margin={{ top: 20, right: 16, bottom: 12, left: 0 }}
                >
                  {axes}
                  {series.map((item) => (
                    <Bar
                      key={item.key}
                      dataKey={item.key}
                      name={item.label}
                      fill={item.color}
                      radius={[2, 2, 0, 0]}
                      maxBarSize={48}
                      isAnimationActive={false}
                    >
                      {showValues && labelsAllowed && (
                        <LabelList
                          position="top"
                          fill="var(--color-foreground)"
                          fontSize={11}
                          dataKey={item.key}
                          formatter={(value: unknown) =>
                            value == null
                              ? ""
                              : formatFinancialTrendValue(
                                  typeof value === "number" ? value : null,
                                  kind,
                                )
                          }
                        />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </ChartFrame>
        <p className="text-muted-foreground mt-3 text-xs leading-5">
          Hover or tap for exact values. Use left and right arrow keys when the chart is focused.
          Missing values are not zero.
        </p>
        <details className="border-border mt-5 border-t pt-4">
          <summary className="focus-visible:ring-ring w-fit cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2">
            View exact values
          </summary>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                {points.length.toLocaleString()} periods ·{" "}
                {mode === "cumulative" ? "Running totals" : "Totals per period"} · UTC
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={!points.length}
                onClick={() =>
                  downloadCsv(`${kind}-chart.csv`, [
                    [
                      "Period (UTC)",
                      "Value type",
                      ...series.map((item) => `${item.label}${kind === "usage" ? "" : " (USD)"}`),
                    ],
                    ...points.map((point) => [
                      point.period,
                      mode === "cumulative" ? "Running total" : "Period total",
                      ...choice.keys.map((key) => point[key] ?? null),
                    ]),
                  ])
                }
              >
                Download chart data
              </Button>
            </div>
            <div className="border-border max-h-80 overflow-auto rounded-sm border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Exact values for {choice.label}, {from} to {to} UTC
                </caption>
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Period (UTC)
                    </th>
                    {series.map((item) => (
                      <th key={item.key} scope="col" className="px-4 py-3 text-right font-medium">
                        {item.label}
                        {kind === "usage" ? "" : " (USD)"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {points.map((point) => (
                    <tr key={point.period}>
                      <th scope="row" className="whitespace-nowrap px-4 py-3 font-normal">
                        {financialTrendPeriodLabel(point.period, granularity, true)}
                      </th>
                      {choice.keys.map((key) => (
                        <td
                          key={key}
                          className="whitespace-nowrap px-4 py-3 text-right tabular-nums"
                        >
                          {formatFinancialTrendValue(point[key], kind)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
