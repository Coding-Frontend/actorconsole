"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_DASHBOARD_PATH,
  type DefaultDashboardPayload,
} from "@actorconsole/shared/default-dashboard";
import {
  ChartFrame,
  ChartTooltip,
  type ChartSeriesDefinition,
} from "@/components/charts/chart-system";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_BASE_URL } from "@/lib/api-base";
import { navigateInApp } from "@/lib/client-navigation";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const amount = (value: number | null) => (value === null ? "—" : money.format(value));
const shortDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const series: ChartSeriesDefinition[] = [
  {
    key: "revenueUsd",
    label: "Revenue",
    color: "var(--color-signal-blue)",
    format: { unit: "currency" },
  },
  {
    key: "usageCostUsd",
    label: "Usage cost",
    color: "var(--color-signal-orange)",
    format: { unit: "currency" },
  },
  {
    key: "earningsUsd",
    label: "Total earnings",
    color: "hsl(var(--success))",
    format: { unit: "currency" },
  },
];

export function DefaultDashboard({ payload }: { payload: DefaultDashboardPayload }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingWorkspace, setPendingWorkspace] = useState<string | null>(null);
  const hasHistory = payload.daily.some(
    (row) => row.revenueUsd !== null || row.usageCostUsd !== null,
  );
  const metrics = [
    {
      label: "Total earnings",
      value: payload.summary.earningsUsd,
      detail: "Revenue minus usage costs on days with both values",
    },
    {
      label: "Revenue",
      value: payload.summary.revenueUsd,
      detail: "Creator revenue in the selected range",
    },
    {
      label: "Usage cost",
      value: payload.summary.usageCostUsd,
      detail: "Apify usage in the selected range",
    },
    {
      label: "Current billing revenue",
      value: payload.currentBillingRevenueUsd,
      detail: `${payload.billingMonth} · ${payload.billingWorkspacesCovered} of ${payload.workspaces.length} workspaces reporting`,
    },
  ];

  function changeRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from"));
    const to = String(data.get("to"));
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (!Number.isFinite(days) || days < 0 || days >= 370) {
      setError("Choose a date range of 1 to 370 days.");
      return;
    }
    setError(null);
    router.push(`${DEFAULT_DASHBOARD_PATH}?${new URLSearchParams({ from, to })}`);
  }

  async function openWorkspace(id: string) {
    if (pendingWorkspace) return;
    setPendingWorkspace(id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/account/business-profiles/${id}/select`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Workspace switch failed");
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
      navigateInApp("/dashboard");
    } catch {
      setError("Could not open the workspace. Try again.");
    } finally {
      setPendingWorkspace(null);
    }
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="All workspaces"
        title="Earnings overview"
        description={`Earnings, usage, and revenue across your ${payload.workspaces.length} workspaces.`}
        primaryAction={
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />
      <form
        key={`${payload.from}:${payload.to}`}
        onSubmit={changeRange}
        className="flex flex-wrap items-end gap-3"
      >
        <label htmlFor="default-earnings-from" className="grid gap-1.5 text-xs font-medium">
          From
          <Input
            id="default-earnings-from"
            type="date"
            name="from"
            defaultValue={payload.from}
            required
          />
        </label>
        <label htmlFor="default-earnings-to" className="grid gap-1.5 text-xs font-medium">
          To
          <Input
            id="default-earnings-to"
            type="date"
            name="to"
            defaultValue={payload.to}
            required
          />
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        <span className="text-muted-foreground pb-2 text-xs">USD · Daily reporting in UTC</span>
      </form>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {payload.partial && (
        <p role="status" className="border-border bg-muted/40 rounded-sm border px-4 py-3 text-sm">
          Some workspaces have incomplete financial data. Totals include available records; missing
          values appear as —. Open a workspace to sync its reporting.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="p-4 sm:p-5">
              <p className="text-muted-foreground text-xs font-medium">{metric.label}</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                {amount(metric.value)}
              </p>
              <p className="text-muted-foreground mt-2 text-xs leading-5">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Daily earnings</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartFrame
            ariaLabel="Earnings across all workspaces"
            series={series}
            status={hasHistory ? "ready" : "empty"}
            statusMessage="No financial history is available yet. Open a workspace and sync its reporting."
            options={{ allowDataLabels: false }}
          >
            {({ visibleSeries, axisLabelsVisible }) => (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={payload.daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    hide={!axisLabelsVisible}
                    tick={{ fontSize: 11 }}
                    minTickGap={30}
                  />
                  <YAxis
                    hide={!axisLabelsVisible}
                    tickFormatter={(value: number) => money.format(value)}
                    tick={{ fontSize: 11 }}
                    width={75}
                  />
                  <Tooltip content={<ChartTooltip series={series} />} />
                  {series
                    .filter((item) => visibleSeries.has(item.key))
                    .map((item) => (
                      <Line
                        key={item.key}
                        type="monotone"
                        dataKey={item.key}
                        stroke={item.color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartFrame>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Workspace earnings</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Earnings by workspace for the selected date range</caption>
            <thead className="text-muted-foreground border-border border-b text-xs">
              <tr>
                <th scope="col" className="px-3 py-3 text-left">
                  Workspace
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right">
                  Revenue
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right">
                  Usage cost
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right">
                  Total earnings
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right">
                  Current billing revenue
                </th>
                <th scope="col" className="px-3 py-3">
                  <span className="sr-only">Open workspace</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payload.workspaces.map((workspace) => (
                <tr key={workspace.id} className="border-border border-b last:border-0">
                  <th scope="row" className="min-w-40 px-3 py-3 text-left font-medium">
                    {workspace.name}
                    <span className="text-muted-foreground mt-1 block text-xs font-normal">
                      {workspace.partial ? "Incomplete data" : "Reporting available"}
                      {workspace.syncedAt &&
                        ` · Synced ${new Date(workspace.syncedAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })}`}
                    </span>
                  </th>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {amount(workspace.revenueUsd)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {amount(workspace.usageCostUsd)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {amount(workspace.earningsUsd)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {amount(workspace.currentBillingRevenueUsd)}
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingWorkspace !== null}
                      aria-label={`Open ${workspace.name}`}
                      onClick={() => void openWorkspace(workspace.id)}
                    >
                      {pendingWorkspace === workspace.id ? "Opening…" : "Open"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Earnings by day</CardTitle>
          <p className="text-muted-foreground text-xs">
            {payload.summary.runs.toLocaleString("en-US")} runs in the selected range. — means no
            reported value.
          </p>
        </CardHeader>
        <CardContent className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Daily earnings across all workspaces, newest first
            </caption>
            <thead className="text-muted-foreground border-border border-b text-xs">
              <tr>
                {[
                  "Date (UTC)",
                  "Revenue",
                  "Usage cost",
                  "Total earnings",
                  "Runs",
                  "Workspaces reporting",
                ].map((label, index) => (
                  <th
                    scope="col"
                    key={label}
                    className={`whitespace-nowrap px-3 py-3 ${index === 0 ? "text-left" : "text-right"}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...payload.daily].reverse().map((row) => (
                <tr key={row.date} className="border-border border-b last:border-0">
                  <th scope="row" className="whitespace-nowrap px-3 py-3 text-left font-normal">
                    {row.date}
                  </th>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {amount(row.revenueUsd)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {amount(row.usageCostUsd)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {amount(row.earningsUsd)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {row.runs.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {row.workspacesCovered} / {payload.workspaces.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
