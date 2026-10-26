"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { earningsMoney } from "@/components/intelligence/earnings-summary";
import {
  comparisonColors,
  historyChartData,
  metricChartData,
  numericMetric,
} from "./comparison-chart-data";
import type { PublicCompareItem, PublicCompareKind } from "./public-comparison-items";

const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const fullNumber = (value: number | null) =>
  value === null ? "Unavailable" : value.toLocaleString("en-US");
const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--popover-foreground))",
  fontSize: 12,
};
const axisStyle = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-56 items-center justify-center px-5 text-center text-sm leading-6 text-muted-foreground">
      {children}
    </div>
  );
}

function MetricChart({
  items,
  metric,
  title,
  subtitle,
  table,
}: {
  items: PublicCompareItem[];
  metric: string;
  title: string;
  subtitle: string;
  table: boolean;
}) {
  const data = metricChartData(items, metric);
  const hasData = data.some((point) => point.value !== null);
  return (
    <figure className="min-w-0 rounded-xl border border-border p-5">
      <figcaption>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p>
      </figcaption>
      {!table ? (
        hasData ? (
          <div className="mt-6 h-56" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 12, right: 6, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tickFormatter={(name: string) =>
                    name.length > 12 ? `${name.slice(0, 11)}…` : name
                  }
                />
                <YAxis
                  tick={axisStyle}
                  tickFormatter={compact}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  domain={metric === "rating" ? [0, 5] : [0, (max: number) => Math.max(1, max)]}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [fullNumber(value), title]}
                />
                <Bar
                  dataKey="value"
                  maxBarSize={54}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                >
                  {data.map((point) => (
                    <Cell key={point.id} fill={point.color} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    fill="hsl(var(--foreground))"
                    fontSize={11}
                    formatter={(value: number) => compact(value)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmpty>
            No published {title.toLowerCase()} data for the selected{" "}
            {items[0]?.kind === "actor" ? "Actors" : "builders"}.
          </ChartEmpty>
        )
      ) : null}
      <table className={table ? "mt-6 w-full text-sm" : "sr-only"}>
        <caption className="sr-only">{title} chart data</caption>
        <tbody>
          {data.map((point) => (
            <tr key={point.id} className="border-b border-border last:border-0">
              <th scope="row" className="py-3 text-left font-normal">
                {point.name}
              </th>
              <td className="py-3 text-right font-semibold tabular-nums">
                {fullNumber(point.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!table && data.some((point) => point.value === null) && hasData ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Some selections have no published value.
        </p>
      ) : null}
    </figure>
  );
}

function EarningsChart({ items }: { items: PublicCompareItem[] }) {
  const data = items.map((item) => ({
    name: item.title,
    low: numericMetric(item, "earningsLow"),
    central: numericMetric(item, "earningsCentral"),
    high: numericMetric(item, "earningsHigh"),
  }));
  const hasData = data.some(
    (point) => point.low !== null || point.central !== null || point.high !== null,
  );
  return (
    <figure className="rounded-xl border border-border p-5 sm:p-6">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Monthly earnings scenarios</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Low, central, and high estimates in USD, before costs.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Fixed 30-day estimates</span>
      </figcaption>
      {hasData ? (
        <div className="mt-6 h-64" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis
                tick={axisStyle}
                tickFormatter={(value: number) => `$${compact(value)}`}
                axisLine={false}
                tickLine={false}
                domain={[0, (max: number) => Math.max(1, max)]}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                contentStyle={tooltipStyle}
                formatter={(value: number) => earningsMoney(value)}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
              <Bar
                name="Low"
                dataKey="low"
                fill={comparisonColors[1]}
                maxBarSize={40}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                name="Central"
                dataKey="central"
                fill={comparisonColors[0]}
                maxBarSize={40}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                name="High"
                dataKey="high"
                fill={comparisonColors[2]}
                maxBarSize={40}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ChartEmpty>Earnings estimates are not available for these selections.</ChartEmpty>
      )}
      <table className="sr-only">
        <caption>Earnings scenario chart data in USD</caption>
        <thead>
          <tr>
            <th>Selection</th>
            <th>Low</th>
            <th>Central</th>
            <th>High</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.name}>
              <th>{point.name}</th>
              <td>{earningsMoney(point.low)}</td>
              <td>{earningsMoney(point.central)}</td>
              <td>{earningsMoney(point.high)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Estimates include covered Actors only. Coverage and the full calculation method appear
        below.
      </p>
    </figure>
  );
}

function HistoryChart({
  items,
  metric,
  title,
}: {
  items: PublicCompareItem[];
  metric: "users" | "runs";
  title: string;
}) {
  const data = historyChartData(items, metric);
  const observed = items.map(
    (item) =>
      item.history?.filter(
        (point) => typeof point[metric] === "number" && Number.isFinite(point[metric]),
      ).length ?? 0,
  );
  const hasTrend = observed.some((count) => count >= 2);
  const coverageKey = metric === "users" ? "usersCoverage" : "runsCoverage";
  const partialItems = items.filter((item) =>
    item.history?.some((point) => {
      const coverage = point[coverageKey];
      return point[metric] != null && coverage && coverage.known < coverage.total;
    }),
  );
  return (
    <figure className="min-w-0 rounded-xl border border-border p-5 sm:p-6">
      <figcaption>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Rolling 30-day totals recorded in daily Store snapshots.
        </p>
        {partialItems.length ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Partial totals for {partialItems.map((item) => item.title).join(", ")}. Only available
            Actor counters are included; unknown values are not counted as zero.
          </p>
        ) : null}
      </figcaption>
      {hasTrend ? (
        <div className="mt-6 h-60" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickFormatter={dateLabel}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tick={axisStyle}
                tickFormatter={compact}
                axisLine={false}
                tickLine={false}
                domain={[0, (max: number) => Math.max(1, max)]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(value: string) => dateLabel(value)}
                formatter={(value: number) => fullNumber(value)}
              />
              {items.map((item, index) => (
                <Line
                  key={item.id}
                  name={`${item.title}${partialItems.includes(item) ? " (partial)" : ""}`}
                  dataKey={`series${index}`}
                  stroke={comparisonColors[index]}
                  strokeWidth={2}
                  type="linear"
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ChartEmpty>
          <span>
            <span className="mb-2 block font-medium text-foreground">
              Activity history is forming
            </span>
            At least two complete daily snapshots are needed to show a trend.
          </span>
        </ChartEmpty>
      )}
      <table className="sr-only">
        <caption>{title} daily observations</caption>
        <thead>
          <tr>
            <th>Date (UTC)</th>
            {items.map((item) => (
              <th key={item.id}>{item.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <th>{point.date}</th>
              {items.map((item) => {
                const entry = item.history?.find((entry) => entry.date === point.date);
                const coverage = entry?.[coverageKey];
                return (
                  <td key={item.id}>
                    {fullNumber(entry?.[metric] ?? null)}
                    {coverage && coverage.known < coverage.total
                      ? ` · ${coverage.known}/${coverage.total} Actors`
                      : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Missing or incomplete days remain gaps.{" "}
        {items
          .filter((_, index) => observed[index] < 2)
          .map((item) => item.title)
          .join(", ")}
        {observed.some((count) => count < 2)
          ? " has insufficient history."
          : "All selected series have observed history."}
      </p>
    </figure>
  );
}

export function ComparisonCharts({
  items,
  kind,
  window,
}: {
  items: PublicCompareItem[];
  kind: PublicCompareKind;
  window: number;
}) {
  const [table, setTable] = useState(false);
  return (
    <div className="space-y-10">
      <section aria-label="Visual comparison">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {kind === "builder" ? "Portfolio & demand" : "Usage & trust"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Compare the same metric on a shared scale.
            </p>
          </div>
          <div
            className="inline-flex rounded-lg border border-border p-1"
            role="group"
            aria-label="Visualization view"
          >
            <button
              type="button"
              aria-pressed={!table}
              onClick={() => setTable(false)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!table ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Charts
            </button>
            <button
              type="button"
              aria-pressed={table}
              onClick={() => setTable(true)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${table ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            >
              <Table2 className="h-3.5 w-3.5" />
              Data
            </button>
          </div>
        </div>
        <ul className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-label="Chart legend">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: comparisonColors[index] }}
                aria-hidden="true"
              />
              {item.title}
            </li>
          ))}
        </ul>
        <div className="grid gap-4 lg:grid-cols-3">
          <MetricChart
            items={items}
            metric={kind === "builder" ? "actorCount" : "rating"}
            title={kind === "builder" ? "Published Actors" : "Rating"}
            subtitle={
              kind === "builder" ? "Current public portfolio" : "Published Store rating, out of 5"
            }
            table={table}
          />
          <MetricChart
            items={items}
            metric="activeUsers"
            title="Active users"
            subtitle={`Selected ${window}-day window`}
            table={table}
          />
          <MetricChart
            items={items}
            metric={kind === "builder" ? "recentRuns" : "runs30Days"}
            title="Runs"
            subtitle="Rolling 30-day total"
            table={table}
          />
        </div>
      </section>
      <section aria-label="Earnings visualization">
        <h2 className="mb-5 text-xl font-semibold tracking-tight">Earnings comparison</h2>
        <EarningsChart items={items} />
      </section>
      <section aria-label="Activity history">
        <h2 className="text-xl font-semibold tracking-tight">Activity history</h2>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          Observed snapshots over the selected {window} days. These are rolling totals, not daily
          events.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <HistoryChart items={items} metric="users" title="Active users / 30d" />
          <HistoryChart items={items} metric="runs" title="Runs / 30d" />
        </div>
      </section>
    </div>
  );
}
