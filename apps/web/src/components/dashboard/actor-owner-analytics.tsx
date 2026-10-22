"use client";

import { useMemo, useState } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckCircle2, CircleDollarSign, Gauge, Sparkles, TrendingUp } from "lucide-react";
import type { OwnerAnalytics } from "./actor-owner-analytics-data";

interface ActorQuality {
  scores?: {
    hasInputSchema?: number;
    hasOutputSchema?: number;
    hasReadme?: number;
    actorQuality?: number;
    actorQualityPercentile?: number;
  } | null;
  praises?: Array<{ title: string; description: string; percentile?: number }>;
  improvements?: Array<{ id?: string; title: string; description: string }>;
}

function usd(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function percent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

export function ActorQualityPanel({
  quality,
  snapshotScore,
  snapshotPercentile,
}: {
  quality: ActorQuality | null;
  snapshotScore?: number | null;
  snapshotPercentile?: number | null;
}) {
  const scores = quality?.scores;
  if (!scores) {
    if (snapshotScore != null && Number.isFinite(snapshotScore)) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <Gauge className="h-4 w-4" /> Actor quality
              </span>
              <span className="text-2xl tabular-nums">{percent(snapshotScore)}</span>
            </CardTitle>
            <p className="text-muted-foreground text-xs">
              Latest saved Apify Insights score
              {snapshotPercentile != null
                ? ` · better than ${percent(snapshotPercentile)} of comparable Actors`
                : ""}
              .
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs leading-5">
              Detailed README and schema checks will appear after the next successful Console
              quality sync.
            </p>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Actor quality score</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Quality score unavailable"
            description="Apify returns this score for public Actors owned by the connected Console account."
          />
        </CardContent>
      </Card>
    );
  }
  const checks = [
    ["README", scores.hasReadme],
    ["Input schema", scores.hasInputSchema],
    ["Output schema", scores.hasOutputSchema],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Actor quality
          </span>
          <span className="text-2xl tabular-nums">{percent(scores.actorQuality)}</span>
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          Better than {percent(scores.actorQualityPercentile)} of comparable Actors.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {checks.map(([label, value]) => (
            <div
              key={label}
              className="border-border/60 bg-muted/15 flex items-center gap-2 rounded-md border px-3 py-2 text-xs"
            >
              <CheckCircle2
                className={
                  (value ?? 0) > 0 ? "text-signal-green h-4 w-4" : "text-muted-foreground h-4 w-4"
                }
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
        {quality.improvements?.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider">
              Recommended improvements
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {quality.improvements.slice(0, 4).map((item) => (
                <div
                  key={item.id ?? item.title}
                  className="border-signal-orange/20 bg-signal-orange/[0.04] rounded-md border p-3"
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ActorRevenuePerformance({ analytics }: { analytics: OwnerAnalytics[] }) {
  const [mode, setMode] = useState<"absolute" | "cumulative">("absolute");
  const currentAnalytics = analytics.at(-1);
  const previousAnalytics = analytics.at(-2);
  const totals = currentAnalytics?.profitMargin?.totalProfitMarginStats?.payingUsersUsd;
  const previousTotals = previousAnalytics?.profitMargin?.totalProfitMarginStats?.payingUsersUsd;
  const monetization = currentAnalytics?.actorBreakdown?.monetizationPerActor?.[0];
  const previousMonetization = previousAnalytics?.actorBreakdown?.monetizationPerActor?.[0];
  const points = analytics
    .flatMap((month) =>
      Object.entries(month.profitMargin?.dailyProfitMarginStats ?? {}).map(([date, item]) => ({
        date,
        label: new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
        revenue: item.payingUsersUsd?.revenueUsd ?? 0,
        cost: item.payingUsersUsd?.costUsd ?? 0,
        profit: item.payingUsersUsd?.profitUsd ?? 0,
      })),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  const displayPoints = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    return points.map((point) => {
      revenue += point.revenue;
      cost += point.cost;
      profit += point.profit;
      return {
        ...point,
        displayRevenue: mode === "cumulative" ? revenue : point.revenue,
        displayCost: mode === "cumulative" ? cost : point.cost,
        displayProfit: mode === "cumulative" ? profit : point.profit,
      };
    });
  }, [mode, points]);
  const series = [
    {
      key: "displayRevenue",
      label: mode === "cumulative" ? "Cumulative revenue" : "Revenue",
      color: "var(--color-signal-green)",
      format: { unit: "currency" as const, currency: "USD" },
    },
    {
      key: "displayCost",
      label: mode === "cumulative" ? "Cumulative cost" : "Cost",
      color: "var(--color-signal-blue)",
      format: { unit: "currency" as const, currency: "USD" },
    },
    {
      key: "displayProfit",
      label: mode === "cumulative" ? "Cumulative profit" : "Profit",
      color: "var(--color-signal-orange)",
      format: { unit: "currency" as const, currency: "USD" },
    },
  ] as const;
  const hasAnalytics = Boolean(totals || monetization || points.length);
  if (!hasAnalytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Actor revenue & performance</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Revenue analytics unavailable"
            description="Revenue and profit are available for monetized Actors owned by the connected Console account."
          />
        </CardContent>
      </Card>
    );
  }
  const earnings = monetization?.earningsStats;
  const previousEarnings = previousMonetization?.earningsStats;
  // Actor breakdown is the source used by Apify's Monetization screen. Prefer
  // it over the profit-margin aggregate so the card cannot drift to the
  // all-user (including free users) amount when Console returns inconsistent
  // labels for an organization.
  const revenue = earnings?.totalRevenueUsd ?? totals?.revenueUsd;
  const cost = earnings?.totalCostUsd ?? totals?.costUsd;
  const profit = earnings?.totalProfitUsd ?? totals?.profitUsd;
  const margin =
    revenue != null && revenue > 0 && profit != null ? profit / revenue : totals?.margin;
  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CircleDollarSign className="h-4 w-4" /> Actor revenue & performance
          </CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">
            Owner-only Apify analytics across the current and previous calendar months.
          </p>
        </div>
        <div
          className="flex shrink-0 gap-1 rounded-sm border p-1"
          role="group"
          aria-label="Actor revenue display"
        >
          <Button
            size="sm"
            variant={mode === "absolute" ? "secondary" : "ghost"}
            onClick={() => setMode("absolute")}
          >
            Absolute
          </Button>
          <Button
            size="sm"
            variant={mode === "cumulative" ? "secondary" : "ghost"}
            onClick={() => setMode("cumulative")}
          >
            Cumulative
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AnalyticsTile label="Revenue" value={usd(revenue)} tone="green" />
          <AnalyticsTile label="Apify cost" value={usd(cost)} />
          <AnalyticsTile label="Profit" value={usd(profit)} tone="orange" />
          <AnalyticsTile label="Profit margin" value={percent(margin)} />
          <AnalyticsTile
            label="Avg run cost"
            value={usd(
              currentAnalytics?.costsPerThousandResults?.totalActorRunsCost?.avgActorRunsCost,
            )}
          />
        </div>
        {points.length ? (
          <div className="bg-muted/10 min-h-72 min-w-0 rounded-md px-2 pt-4">
            <ChartFrame
              ariaLabel="Actor revenue, cost, and profit trend"
              series={series}
              options={{ compact: true }}
              chartClassName="h-72 min-w-0"
            >
              {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={displayPoints}
                    margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="actorRevenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--color-signal-green)"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-signal-green)"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--color-border)"
                      strokeOpacity={0.5}
                    />
                    <XAxis
                      dataKey="label"
                      hide={!axisLabelsVisible}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={34}
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <YAxis
                      hide={!axisLabelsVisible}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(value) => usd(Number(value))}
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <Tooltip content={<ChartTooltip series={series} />} />
                    <Area
                      type="monotone"
                      dataKey="displayRevenue"
                      name={series[0].label}
                      hide={!visibleSeries.has("displayRevenue")}
                      stroke="var(--color-signal-green)"
                      fill="url(#actorRevenueFill)"
                      strokeWidth={2}
                      label={
                        dataLabelsVisible
                          ? { fill: "var(--color-foreground)", fontSize: 10 }
                          : false
                      }
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="displayCost"
                      name={series[1].label}
                      hide={!visibleSeries.has("displayCost")}
                      stroke="var(--color-signal-blue)"
                      fill="transparent"
                      strokeWidth={2}
                      label={
                        dataLabelsVisible
                          ? { fill: "var(--color-foreground)", fontSize: 10 }
                          : false
                      }
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="displayProfit"
                      name={series[2].label}
                      hide={!visibleSeries.has("displayProfit")}
                      stroke="var(--color-signal-orange)"
                      fill="transparent"
                      strokeWidth={2}
                      label={
                        dataLabelsVisible
                          ? { fill: "var(--color-foreground)", fontSize: 10 }
                          : false
                      }
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartFrame>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">
            <Sparkles className="mr-1 h-3 w-3" />{" "}
            {monetization?.chargedResults?.toLocaleString() ?? "—"} charged results
          </Badge>
          <Badge variant="outline">
            Previous revenue {usd(previousEarnings?.totalRevenueUsd ?? previousTotals?.revenueUsd)}
          </Badge>
          <Badge variant="outline">
            Previous profit {usd(previousEarnings?.totalProfitUsd ?? previousTotals?.profitUsd)}
          </Badge>
          <Badge variant="outline">
            <TrendingUp className="mr-1 h-3 w-3" />{" "}
            {monetization?.usersStats?.payingUsers?.toLocaleString() ?? "—"} paying users
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyticsTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "orange";
}) {
  return (
    <div className="border-border/60 bg-muted/15 rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={
          tone === "green"
            ? "text-signal-green mt-1 text-xl font-semibold tabular-nums"
            : tone === "orange"
              ? "text-signal-orange mt-1 text-xl font-semibold tabular-nums"
              : "mt-1 text-xl font-semibold tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}
