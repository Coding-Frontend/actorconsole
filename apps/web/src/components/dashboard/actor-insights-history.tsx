"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, ChartTooltip } from "@/components/charts/chart-system";
import {
  Activity,
  Bug,
  Database,
  Eye,
  Gauge,
  MousePointerClick,
  RefreshCw,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export interface ActorInsightSnapshotView {
  id: string;
  capturedOn: string;
  capturedAt: string;
  syncStatus: string;
  totalRuns: number | null;
  succeededRuns: number | null;
  failedRuns: number | null;
  abortedRuns?: number | null;
  timedOutRuns?: number | null;
  resultCount?: number | null;
  successRate: number | null;
  activeUsers: number | null;
  uniqueStoreViewers: number | null;
  consolePageViews: number | null;
  usersWithRun: number | null;
  qualityScore: number | null;
  qualityPercentile?: number | null;
  revenueUsd?: number | null;
  profitUsd?: number | null;
  acquisition?: unknown;
}

type TrafficItem = { origin?: string; trafficPercent?: number };
type AcquisitionPeriod = {
  monthStartAt?: string;
  numUniqueViewingUsers?: number;
  numUniqueConsolePageViews?: number;
  numUniqueUsersWithRun?: number;
  topReferrers?: TrafficItem[];
  topCountryCodes?: TrafficItem[];
};
type DebuggingSummary = {
  total: number;
  sampled: number;
  retentionDays: number;
  latestFinishedAt: string | null;
  statuses: Record<string, number>;
  dailyRuns: Record<string, number>;
};

function percentage(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(Math.abs(value) <= 1 ? value * 100 : value).toFixed(1)}%`;
}

function count(value: number | null | undefined) {
  return value == null ? "—" : Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function acquisition(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as AcquisitionPeriod & { periods?: AcquisitionPeriod[] };
  const periods = Array.isArray(record.periods) ? record.periods : [record];
  const ordered = periods
    .filter((item) => typeof item?.monthStartAt === "string")
    .sort((left, right) => String(right.monthStartAt).localeCompare(String(left.monthStartAt)));
  return { current: ordered[0] ?? record, previous: ordered[1] ?? null };
}

function change(current: number | undefined, previous: number | undefined) {
  if (current == null || previous == null) return null;
  const delta = current - previous;
  return `${delta >= 0 ? "+" : ""}${count(delta)} vs previous month`;
}

export function actorInsightErrorMessage(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const errors = Array.from(
    new Set(
      value
        .split(" | ")
        .map((error) => error.trim())
        .filter(Boolean),
    ),
  );
  if (
    errors.some(
      (error) =>
        error.includes("insufficient-permissions") ||
        error.toLowerCase().includes("insufficient permissions"),
    )
  ) {
    return "Apify Console could not read this Actor in the selected workspace organization. Reconnect the Console credential with that organization selected, then sync again.";
  }
  const visible = errors.slice(0, 2).join(" · ");
  return errors.length > 2 ? `${visible} · ${errors.length - 2} more errors` : visible;
}

export function ActorInsightsHistory({
  snapshots,
  debugging,
  lastSyncAt,
  syncStatus,
  syncError,
}: {
  snapshots: ActorInsightSnapshotView[];
  debugging?: DebuggingSummary | null;
  lastSyncAt?: string | null;
  syncStatus?: string | null;
  syncError?: string | null;
}) {
  const points = useMemo(
    () =>
      [...snapshots].reverse().map((item) => ({
        ...item,
        label: new Date(item.capturedOn).toLocaleDateString("en", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
        successPercent: item.successRate == null ? null : item.successRate * 100,
      })),
    [snapshots],
  );
  const latest = snapshots[0];
  const latestSuccessRate = snapshots.find((item) => item.successRate != null)?.successRate;
  const latestActiveUsers = snapshots.find((item) => item.activeUsers != null)?.activeUsers;
  const latestResultCount = snapshots.find((item) => item.resultCount != null)?.resultCount;
  const latestDiscovery = snapshots.find(
    (item) =>
      item.uniqueStoreViewers != null ||
      item.usersWithRun != null ||
      item.consolePageViews != null ||
      item.acquisition != null,
  );
  const latestQuality = snapshots.find((item) => item.qualityScore != null);
  const discovery = acquisition(latestDiscovery?.acquisition);
  const currentDiscovery = discovery?.current;
  const conversionRate = currentDiscovery?.numUniqueViewingUsers
    ? (currentDiscovery.numUniqueUsersWithRun ?? 0) / currentDiscovery.numUniqueViewingUsers
    : null;
  const status = syncStatus ?? latest?.syncStatus ?? "PENDING";
  const statusVariant = status === "COMPLETE" ? "default" : "outline";
  const visibleSyncError = actorInsightErrorMessage(syncError);
  const runSeries = [
    {
      key: "succeededRuns",
      label: "Succeeded",
      color: "var(--color-signal-green)",
      format: { unit: "compact" as const },
    },
    {
      key: "failedRuns",
      label: "Failed",
      color: "var(--color-signal-orange)",
      format: { unit: "compact" as const },
    },
    {
      key: "abortedRuns",
      label: "Aborted",
      color: "var(--color-muted-foreground)",
      format: { unit: "compact" as const },
    },
    {
      key: "timedOutRuns",
      label: "Timed out",
      color: "var(--color-destructive)",
      format: { unit: "compact" as const },
    },
  ] as const;
  const successSeries = [
    {
      key: "successPercent",
      label: "Success %",
      color: "var(--color-signal-green)",
      format: { unit: "percent" as const },
    },
    {
      key: "activeUsers",
      label: "Active users",
      color: "var(--color-signal-blue)",
      format: { unit: "compact" as const },
    },
  ] as const;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <RefreshCw className="h-4 w-4" /> Daily Apify Insights sync
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                Monitoring, acquisition, Actor quality, and monetization are reconciled every day.
              </p>
            </div>
            <Badge variant={statusVariant}>{status.toLowerCase().replaceAll("_", " ")}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            {lastSyncAt
              ? `Last checked ${new Date(lastSyncAt).toLocaleString()}`
              : "Initial sync is queued."}
          </p>
          {visibleSyncError ? (
            <p className="border-destructive/30 bg-destructive/5 text-destructive mt-3 rounded-md border p-3 text-xs">
              {visibleSyncError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {latest ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InsightTile
              icon={Activity}
              label="Run success"
              value={percentage(latestSuccessRate)}
            />
            <InsightTile icon={Users} label="Active users" value={count(latestActiveUsers)} />
            <InsightTile icon={Database} label="Results" value={count(latestResultCount)} />
            <InsightTile
              icon={Eye}
              label="Store viewers"
              value={count(latestDiscovery?.uniqueStoreViewers)}
            />
            <InsightTile
              icon={MousePointerClick}
              label="Users with a run"
              value={count(latestDiscovery?.usersWithRun)}
            />
            <InsightTile
              icon={Eye}
              label="Console page views"
              value={count(latestDiscovery?.consolePageViews)}
            />
            <InsightTile
              icon={Gauge}
              label="Actor quality"
              value={percentage(latestQuality?.qualityScore)}
            />
            <InsightTile
              icon={MousePointerClick}
              label="Viewer conversion"
              value={percentage(conversionRate)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Run reliability by actual day</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Successful and failed runs retain their Apify event date.
                </p>
              </CardHeader>
              <CardContent className="min-h-72 min-w-0">
                <ChartFrame
                  ariaLabel="Run reliability by actual day"
                  series={runSeries}
                  status={points.length ? "ready" : "empty"}
                  options={{ compact: true }}
                  chartClassName="h-72 min-w-0"
                >
                  {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={points} margin={{ left: -18, right: 4 }}>
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
                          minTickGap={28}
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                        <YAxis
                          hide={!axisLabelsVisible}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                        <Tooltip content={<ChartTooltip series={runSeries} />} />
                        <Bar
                          dataKey="succeededRuns"
                          name="Succeeded"
                          hide={!visibleSeries.has("succeededRuns")}
                          stackId="runs"
                          fill="var(--color-signal-green)"
                          radius={[3, 3, 0, 0]}
                          label={dataLabelsVisible}
                        />
                        <Bar
                          dataKey="failedRuns"
                          name="Failed"
                          hide={!visibleSeries.has("failedRuns")}
                          stackId="runs"
                          fill="var(--color-signal-orange)"
                          radius={[3, 3, 0, 0]}
                          label={dataLabelsVisible}
                        />
                        <Bar
                          dataKey="abortedRuns"
                          name="Aborted"
                          hide={!visibleSeries.has("abortedRuns")}
                          stackId="runs"
                          fill="var(--color-muted-foreground)"
                          label={dataLabelsVisible}
                        />
                        <Bar
                          dataKey="timedOutRuns"
                          name="Timed out"
                          hide={!visibleSeries.has("timedOutRuns")}
                          stackId="runs"
                          fill="var(--color-destructive)"
                          radius={[3, 3, 0, 0]}
                          label={dataLabelsVisible}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartFrame>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Success rate & active users</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Stored daily so prior dates remain available after Console rolls over.
                </p>
              </CardHeader>
              <CardContent className="min-h-72 min-w-0">
                <ChartFrame
                  ariaLabel="Success rate and active users by actual day"
                  series={successSeries}
                  status={points.length ? "ready" : "empty"}
                  options={{ compact: true }}
                  chartClassName="h-72 min-w-0"
                >
                  {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={points} margin={{ left: -18, right: 4 }}>
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
                          minTickGap={28}
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                        <YAxis
                          hide={!axisLabelsVisible}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                        <Tooltip content={<ChartTooltip series={successSeries} />} />
                        <Area
                          type="monotone"
                          dataKey="successPercent"
                          name="Success %"
                          hide={!visibleSeries.has("successPercent")}
                          stroke="var(--color-signal-green)"
                          fill="var(--color-signal-green)"
                          fillOpacity={0.12}
                          strokeWidth={2}
                          label={
                            dataLabelsVisible
                              ? { fill: "var(--color-foreground)", fontSize: 10 }
                              : false
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="activeUsers"
                          name="Active users"
                          hide={!visibleSeries.has("activeUsers")}
                          stroke="var(--color-signal-blue)"
                          fill="transparent"
                          strokeWidth={2}
                          label={
                            dataLabelsVisible
                              ? { fill: "var(--color-foreground)", fontSize: 10 }
                              : false
                          }
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </ChartFrame>
              </CardContent>
            </Card>
          </div>

          {currentDiscovery?.topReferrers?.length || currentDiscovery?.topCountryCodes?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Acquisition sources · current month</CardTitle>
                <p className="text-muted-foreground text-xs">
                  {change(
                    currentDiscovery.numUniqueViewingUsers,
                    discovery?.previous?.numUniqueViewingUsers,
                  ) ?? "Previous-month comparison will appear after the first complete sync."}
                </p>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <TrafficList title="Top referrers" items={currentDiscovery.topReferrers ?? []} />
                <TrafficList title="Top countries" items={currentDiscovery.topCountryCodes ?? []} />
              </CardContent>
            </Card>
          ) : null}

          {debugging ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Bug className="h-4 w-4" /> Consented user-run debugging
                </CardTitle>
                <p className="text-muted-foreground text-xs">
                  Live Console summary only. ActorConsole does not store run IDs or user identities;
                  Apify limits this feed to {debugging.retentionDays} days.
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Badge variant="outline">{count(debugging.total)} shared runs</Badge>
                {Object.entries(debugging.statuses).map(([runStatus, total]) => (
                  <Badge key={runStatus} variant="secondary">
                    {runStatus.toLowerCase().replaceAll("_", " ")} · {count(total)}
                  </Badge>
                ))}
                {debugging.latestFinishedAt ? (
                  <span className="text-muted-foreground self-center text-xs">
                    Latest {new Date(debugging.latestFinishedAt).toLocaleString()}
                  </span>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              title="Insight history is forming"
              description="The first account bootstrap stores up to three months, then ActorConsole checks the current month every day."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InsightTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="text-signal-orange h-4 w-4" />
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TrafficList({ title, items }: { title: string; items: TrafficItem[] }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider">{title}</p>
      <div className="space-y-2">
        {items.slice(0, 6).map((item) => (
          <div key={item.origin} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{item.origin ?? "Direct"}</span>
            <span className="text-muted-foreground tabular-nums">
              {percentage(item.trafficPercent)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
