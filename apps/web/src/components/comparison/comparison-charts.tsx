"use client";

import { useState } from "react";
import { ChartFrame } from "@/components/charts/chart-system";
import { ChartJsChart } from "@/components/charts/chartjs-chart";
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
          <div className="mt-6 h-56">
            <ChartJsChart
              ariaLabel={title}
              data={data}
              xKey="name"
              series={[
                {
                  key: "value",
                  label: title,
                  color: comparisonColors[0]!,
                  colorKey: "color",
                  formatValue: fullNumber,
                  dataLabelFormatter: compact,
                  maxBarThickness: 54,
                },
              ]}
              type="bar"
              showDataLabels
              xLabelFormatter={(name) => (name.length > 12 ? `${name.slice(0, 11)}…` : name)}
              yAxis={{
                formatValue: compact,
                integer: metric !== "rating",
                min: 0,
                ...(metric === "rating" ? { max: 5 } : {}),
              }}
            />
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
        <div className="mt-6">
          <ChartFrame
            ariaLabel="Monthly earnings scenarios"
            series={[
              { key: "low", label: "Low", color: comparisonColors[1]!, formatValue: earningsMoney },
              {
                key: "central",
                label: "Central",
                color: comparisonColors[0]!,
                formatValue: earningsMoney,
              },
              {
                key: "high",
                label: "High",
                color: comparisonColors[2]!,
                formatValue: earningsMoney,
              },
            ]}
            options={{ allowAxisLabels: false, allowDataLabels: false }}
            chartClassName="h-64"
          >
            {(state) => (
              <ChartJsChart
                ariaLabel="Monthly earnings scenarios"
                data={data}
                xKey="name"
                series={[
                  {
                    key: "low",
                    label: "Low",
                    color: comparisonColors[1]!,
                    formatValue: earningsMoney,
                  },
                  {
                    key: "central",
                    label: "Central",
                    color: comparisonColors[0]!,
                    formatValue: earningsMoney,
                  },
                  {
                    key: "high",
                    label: "High",
                    color: comparisonColors[2]!,
                    formatValue: earningsMoney,
                  },
                ]}
                type="bar"
                state={state}
                yAxis={{ formatValue: (value) => `$${compact(value)}` }}
              />
            )}
          </ChartFrame>
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
        <div className="mt-6 h-60">
          <ChartJsChart
            ariaLabel={title}
            data={data}
            xKey="date"
            series={items.map((item, index) => ({
              key: `series${index}`,
              label: `${item.title}${partialItems.includes(item) ? " (partial)" : ""}`,
              color: comparisonColors[index]!,
              pointRadius: 2,
              formatValue: fullNumber,
            }))}
            xLabelFormatter={dateLabel}
            tooltipTitle={(point) => dateLabel(String(point.date))}
            yAxis={{ formatValue: compact, integer: true }}
          />
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
