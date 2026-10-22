"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, ChartTooltip } from "@/components/charts/chart-system";
import { FinancialTrendChart } from "./financial-trend-chart";
import {
  Activity,
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleDollarSign,
  Download,
  ExternalLink,
  Gauge,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemsPerPageSelect } from "@/components/ui/items-per-page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DashboardAsyncState,
  DashboardFilterRail,
  DashboardFilterSummary,
  ResponsiveFilterBar,
} from "@/components/dashboard/dashboard-workbench";
import {
  resolveCurrentServiceEntries,
  type UsageCostsPayload,
} from "@/components/dashboard/usage-costs-analytics";
import type { FinancialDashboardKind } from "@/lib/financial-dashboard";
import { DEFAULT_PAGE_SIZE } from "@/lib/page-size";
import { usePageDataPending } from "@/lib/page-data-state";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const DAY_MS = 86_400_000;

type FinancialLedger = NonNullable<UsageCostsPayload["revenue"]>["ledger"];
type SortKey =
  | "name"
  | "date"
  | "runs"
  | "success"
  | "failed"
  | "results"
  | "users"
  | "direct"
  | "allocated"
  | "revenue"
  | "profit"
  | "margin"
  | "share";

interface TableRow {
  key: string;
  actorId: string;
  apifyActorId: string;
  name: string;
  slug: string;
  date: string | null;
  runs: number;
  successfulRuns: number;
  failedRuns: number;
  results: number;
  activeUsers: number | null;
  directCostUsd: number | null;
  allocatedCostUsd: number | null;
  revenueUsd: number | null;
  netProfitUsd: number | null;
  margin: number | null;
  costSource: string | null;
  costShare: number | null;
  previousRevenueUsd?: number | null;
  previousNetProfitUsd?: number | null;
  previousRuns?: number | null;
  actorDays?: number;
  costCoveredDays?: number;
  allocatedCoveredDays?: number;
  revenueCoveredDays?: number;
}

type ActorTableView = "total" | "daily" | "weekly";

function utcTodayOffset(days = 0) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function financialDateKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

export function financialWeekKey(value: string | Date) {
  const date = new Date(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00.000Z`
      : value,
  );
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export function financialChartDay(entry: unknown) {
  if (!entry || typeof entry !== "object") return null;
  const candidate = entry as {
    period?: unknown;
    payload?: { period?: unknown };
    activePayload?: Array<{ payload?: { period?: unknown } }>;
  };
  const period =
    candidate.period ?? candidate.payload?.period ?? candidate.activePayload?.[0]?.payload?.period;
  return typeof period === "string" && /^\d{4}-\d{2}-\d{2}$/.test(period) ? period : null;
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function periodLabel(value: string, tableView: ActorTableView) {
  if (tableView !== "weekly") return value;
  const end = new Date(`${value}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${dateLabel(value)}–${dateLabel(end.toISOString().slice(0, 10))}`;
}

function chartPeriodLabel(value: string, granularity: "day" | "week" | "month") {
  if (granularity === "week") return `Week of ${dateLabel(value)}`;
  return value.length === 10 ? dateLabel(value) : value;
}

function percentage(current: number, previous: number) {
  if (!previous) return current ? 100 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function Delta({ current, previous }: { current: number | null; previous?: number | null }) {
  if (current == null || previous == null) return null;
  const change = current - previous;
  return (
    <span
      className={`mt-0.5 block text-[10px] ${change > 0 ? "text-signal-green" : change < 0 ? "text-signal-orange" : "text-muted-foreground"}`}
    >
      {change > 0 ? "+" : ""}
      {change.toLocaleString("en-US", { maximumFractionDigits: 2 })} vs previous
    </span>
  );
}

function serviceGroup(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.includes("proxy") || normalized.includes("serp")) return "Proxy";
  if (normalized.includes("transfer") || normalized.includes("traffic")) return "Data transfer";
  if (
    normalized.includes("storage") ||
    normalized.includes("dataset") ||
    normalized.includes("key_value") ||
    normalized.includes("request_queue")
  )
    return "Storage";
  if (normalized.includes("actor") || normalized.includes("compute")) return "Actors";
  return "Other services";
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  icon: typeof Activity;
}) {
  return (
    <Card variant="stat">
      <CardContent className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
          <div className="text-muted-foreground mt-1 text-xs">{detail}</div>
        </div>
        <span className="bg-signal-orange/10 text-signal-orange flex h-9 w-9 shrink-0 items-center justify-center rounded-sm">
          <Icon className="h-4 w-4" />
        </span>
      </CardContent>
    </Card>
  );
}

function ActorPicker({
  actors,
  selectedIds,
  onChange,
}: {
  actors: UsageCostsPayload["items"];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = new Set(selectedIds);
  const visible = actors.filter((actor) =>
    `${actor.title ?? ""} ${actor.username} ${actor.actorName}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full min-w-44 justify-between sm:w-auto"
          aria-label="Actor filter"
        >
          <span className="truncate">
            {selectedIds.length === 0
              ? "All Actors"
              : selectedIds.length === 1
                ? (actors.find((actor) => actor.id === selectedIds[0])?.title ?? "1 Actor")
                : `${selectedIds.length} Actors`}
          </span>
          <ChevronsUpDown className="text-muted-foreground h-4 w-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="border-border bg-popover text-popover-foreground z-50 w-[min(360px,calc(100vw-2rem))] rounded-sm border p-3 shadow-2xl"
        >
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find an Actor"
              className="pl-9"
            />
          </div>
          <div className="scroll-soft mt-3 max-h-72 space-y-1 overflow-y-auto">
            {visible.map((actor) => {
              const checked = selected.has(actor.id);
              return (
                <button
                  key={actor.id}
                  type="button"
                  className="hover:bg-accent focus-visible:ring-ring flex w-full items-start gap-3 rounded-sm px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2"
                  onClick={() =>
                    onChange(
                      checked
                        ? selectedIds.filter((actorId) => actorId !== actor.id)
                        : [...selectedIds, actor.id],
                    )
                  }
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border ${checked ? "border-signal-orange bg-signal-orange text-primary-foreground" : "border-border"}`}
                  >
                    {checked ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">
                      {actor.title ?? actor.actorName}
                    </span>
                    <span className="text-muted-foreground block truncate font-mono text-[10px]">
                      {actor.username}/{actor.actorName}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear
            </Button>
            <span className="text-muted-foreground text-[10px]">{selectedIds.length} selected</span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-muted-foreground px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
        {label}
      </span>
      {children}
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total ? (safePage - 1) * pageSize + 1 : 0;
  const end = Math.min(safePage * pageSize, total);
  return (
    <div className="border-border/80 mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-xs">
        Showing {start.toLocaleString("en-US")}–{end.toLocaleString("en-US")} of{" "}
        {total.toLocaleString("en-US")}
      </p>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <ItemsPerPageSelect
          value={pageSize}
          onChange={(size) => {
            onPageSizeChange(size);
            onPageChange(1);
          }}
          label="Rows per page"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-muted-foreground min-w-14 text-center text-xs">
          {safePage}/{totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function downloadCsv(kind: FinancialDashboardKind, rows: TableRow[]) {
  const columns = [
    "date",
    "actor",
    "apifyActorId",
    "runs",
    "successfulRuns",
    "failedRuns",
    "results",
    "activeUsers",
    "directCostUsd",
    "allocatedCostUsd",
    "revenueUsd",
    "netProfitUsd",
    "margin",
    "costSource",
  ] as const;
  const value = (row: TableRow, column: (typeof columns)[number]) => {
    if (column === "actor") return row.name;
    return row[column] ?? "";
  };
  const escape = (input: unknown) => `"${String(input).replaceAll('"', '""')}"`;
  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escape(value(row, column))).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${kind}-actor-report.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function aggregateFinancialLedger(rows: FinancialLedger): TableRow[] {
  const grouped = new Map<string, TableRow>();
  for (const row of rows) {
    const current = grouped.get(row.actorId) ?? {
      key: row.actorId,
      actorId: row.actorId,
      apifyActorId: row.apifyActorId,
      name: row.title ?? row.actorName,
      slug: `${row.username}/${row.actorName}`,
      date: null,
      runs: 0,
      successfulRuns: 0,
      failedRuns: 0,
      results: 0,
      activeUsers: 0,
      directCostUsd: 0,
      allocatedCostUsd: 0,
      revenueUsd: 0,
      netProfitUsd: 0,
      margin: null,
      costSource: null,
      costShare: null,
    };
    current.runs += row.runs;
    current.successfulRuns += Number(row.successfulRuns ?? 0);
    current.failedRuns += Number(row.failedRuns ?? 0);
    current.results += row.results;
    current.activeUsers = (current.activeUsers ?? 0) + (row.activeUsers ?? 0);
    current.directCostUsd =
      current.directCostUsd == null || row.directCostUsd == null
        ? null
        : current.directCostUsd + row.directCostUsd;
    current.allocatedCostUsd =
      current.allocatedCostUsd == null || row.allocatedCostUsd == null
        ? null
        : current.allocatedCostUsd + row.allocatedCostUsd;
    current.revenueUsd =
      current.revenueUsd == null || row.revenueUsd == null
        ? null
        : current.revenueUsd + row.revenueUsd;
    current.netProfitUsd =
      current.netProfitUsd == null || row.netProfitUsd == null
        ? null
        : current.netProfitUsd + row.netProfitUsd;
    current.costSource = row.costSource;
    grouped.set(row.actorId, current);
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    margin:
      row.revenueUsd && row.netProfitUsd != null ? (row.netProfitUsd / row.revenueUsd) * 100 : null,
  }));
}

export function dailyFinancialLedgerRows(rows: FinancialLedger): TableRow[] {
  return rows.map((row) => ({
    key: `${row.actorId}:${row.date}`,
    actorId: row.actorId,
    apifyActorId: row.apifyActorId,
    name: row.title ?? row.actorName,
    slug: `${row.username}/${row.actorName}`,
    date: row.date,
    runs: row.runs,
    successfulRuns: Number(row.successfulRuns ?? 0),
    failedRuns: Number(row.failedRuns ?? 0),
    results: row.results,
    activeUsers: row.activeUsers,
    directCostUsd: row.directCostUsd,
    allocatedCostUsd: row.allocatedCostUsd,
    revenueUsd: row.revenueUsd,
    netProfitUsd: row.netProfitUsd,
    margin: row.margin,
    costSource: row.costSource,
    costShare: null,
  }));
}

export function weeklyFinancialLedgerRows(rows: FinancialLedger): TableRow[] {
  const weeklyRows = rows.map((row) => ({ ...row, date: financialWeekKey(row.date) }));
  const grouped = new Map<string, FinancialLedger>();
  for (const row of weeklyRows) {
    const key = `${row.actorId}:${row.date}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return [...grouped.entries()].map(([key, weekRows]) => ({
    ...aggregateFinancialLedger(weekRows)[0]!,
    key,
    date: weekRows[0]!.date,
  }));
}

export function usagePeriodRows(
  actors: UsageCostsPayload["items"],
  from: string,
  to: string,
  tableView: "daily" | "weekly",
): TableRow[] {
  const grouped = new Map<string, TableRow>();
  for (const actor of actors) {
    for (const usage of actor.usageDaily) {
      const day = financialDateKey(usage.date);
      if (day < from || day > to) continue;
      const period = tableView === "weekly" ? financialWeekKey(day) : day;
      const key = `${actor.id}:${period}`;
      const row = grouped.get(key) ?? {
        key,
        actorId: actor.id,
        apifyActorId: actor.apifyActorId,
        name: actor.title ?? actor.actorName,
        slug: `${actor.username}/${actor.actorName}`,
        date: period,
        runs: 0,
        successfulRuns: 0,
        failedRuns: 0,
        results: 0,
        activeUsers: null,
        directCostUsd: null,
        allocatedCostUsd: null,
        revenueUsd: null,
        netProfitUsd: null,
        margin: null,
        costSource: null,
        costShare: null,
      };
      row.runs += usage.runs;
      row.successfulRuns += Number(usage.successfulRuns ?? 0);
      row.failedRuns += Number(usage.failedRuns ?? 0);
      row.results += Number(usage.resultCount ?? 0);
      grouped.set(key, row);
    }
  }
  return [...grouped.values()];
}

function actorFinancialTotalRows(
  actors: NonNullable<UsageCostsPayload["revenue"]>["actors"],
): TableRow[] {
  return actors.map((actor) => {
    const actorDays = actor.actorDays ?? 0;
    const costCoveredDays = actor.costCoveredDays ?? (actor.costAvailable ? actorDays || 1 : 0);
    const allocatedCoveredDays =
      actor.allocatedCoveredDays ?? (actor.allocatedCostAvailable ? actorDays || 1 : 0);
    const revenueCoveredDays = actor.revenueCoveredDays ?? actorDays;
    const hasDirectCost = costCoveredDays > 0;
    const hasAllocatedCost = allocatedCoveredDays > 0;
    const hasRevenue = revenueCoveredDays > 0;
    return {
      key: actor.id,
      actorId: actor.id,
      apifyActorId: actor.apifyActorId,
      name: actor.title ?? actor.actorName,
      slug: `${actor.username}/${actor.actorName}`,
      date: null,
      runs: actor.runs,
      successfulRuns: actor.successfulRuns ?? 0,
      failedRuns: actor.failedRuns ?? 0,
      results: actor.results,
      activeUsers: actor.activeUsersCoveredDays === 0 ? null : actor.activeUsers,
      directCostUsd: hasDirectCost ? actor.costUsd : null,
      allocatedCostUsd: hasAllocatedCost ? actor.allocatedCostUsd : null,
      revenueUsd: hasRevenue ? actor.revenueUsd : null,
      netProfitUsd: hasAllocatedCost && hasRevenue ? actor.netProfitUsd : null,
      margin: hasAllocatedCost && hasRevenue ? actor.margin : null,
      costSource: hasDirectCost ? "actor-range" : "unavailable",
      costShare: null,
      previousRevenueUsd: actor.previousRevenueUsd,
      previousNetProfitUsd: actor.previousNetProfitUsd,
      previousRuns: actor.previousRuns,
      actorDays,
      costCoveredDays,
      allocatedCoveredDays,
      revenueCoveredDays,
    };
  });
}

export function FinancialAnalyticsPage({
  kind,
  payload,
  actorHrefPrefix = "/dashboard/actors",
  connectionHref = "/dashboard/apify",
}: {
  kind: FinancialDashboardKind;
  payload: UsageCostsPayload;
  actorHrefPrefix?: string;
  connectionHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dataPending = usePageDataPending();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortKey, setSortKey] = useState<SortKey>(
    kind === "usage" ? "runs" : kind === "costs" ? "direct" : "revenue",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [customRangeOpen, setCustomRangeOpen] = useState(false);

  const filters = payload.filters;
  const selectedFrom = filters?.from ?? utcTodayOffset(-29);
  const selectedTo = filters?.to ?? utcTodayOffset();
  const selectedDay = filters?.day ?? null;
  const selectedActorIds = filters?.actorIds ?? [];
  const selectedActorSet = new Set(selectedActorIds);
  const granularity = filters?.granularity ?? "day";
  const mode = filters?.mode ?? "absolute";
  const requestedTableView = searchParams.get("table");
  const tableView: ActorTableView = selectedDay
    ? "daily"
    : kind === "revenue"
      ? "total"
      : requestedTableView === "weekly"
        ? "weekly"
        : requestedTableView === "daily"
          ? "daily"
          : "total";
  const compare = searchParams.get("compare") !== "false";
  const days =
    Math.floor(
      (Date.parse(`${selectedTo}T00:00:00Z`) - Date.parse(`${selectedFrom}T00:00:00Z`)) / DAY_MS,
    ) + 1;
  const preset = [3, 6, 7, 30, 90].includes(days) ? String(days) : "custom";
  // The URL updates immediately, before the refreshed payload arrives. Read it
  // for controls so rapid selections do not overwrite the previous click.
  const controlActorIds = dataPending
    ? (searchParams.get("actors")?.split(",").filter(Boolean) ?? [])
    : selectedActorIds;
  const controlFrom = dataPending
    ? (searchParams.get("from") ?? utcTodayOffset(-29))
    : selectedFrom;
  const controlTo = dataPending ? (searchParams.get("to") ?? utcTodayOffset()) : selectedTo;
  const controlDays =
    Math.floor(
      (Date.parse(`${controlTo}T00:00:00Z`) - Date.parse(`${controlFrom}T00:00:00Z`)) / DAY_MS,
    ) + 1;
  const controlPreset = [3, 6, 7, 30, 90].includes(controlDays) ? String(controlDays) : "custom";

  const updateUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };

  const scopedActors = payload.items.filter(
    (actor) => !selectedActorSet.size || selectedActorSet.has(actor.id),
  );
  const revenue = payload.revenue;
  const ledger = useMemo(() => revenue?.ledger ?? [], [revenue?.ledger]);
  const revenueActorMap = useMemo(
    () => new Map((revenue?.actors ?? []).map((actor) => [actor.id, actor])),
    [revenue?.actors],
  );

  const usageTotalRows = useMemo(() => {
    return scopedActors
      .map<TableRow>((actor) => {
        const actorDays = actor.usageDaily.filter((item) => {
          const day = financialDateKey(item.date);
          return day >= selectedFrom && day <= selectedTo && (!selectedDay || day === selectedDay);
        });
        const financial = revenueActorMap.get(actor.id);
        const dayFinancial = selectedDay
          ? ledger.find((row) => row.actorId === actor.id && row.date === selectedDay)
          : null;
        const runs = dayFinancial?.runs ?? financial?.runs;
        const successfulRuns = dayFinancial?.successfulRuns ?? financial?.successfulRuns;
        const failedRuns = dayFinancial?.failedRuns ?? financial?.failedRuns;
        const results = dayFinancial?.results ?? financial?.results;
        const activeUsers = dayFinancial?.activeUsers ?? financial?.activeUsers;
        return {
          key: actor.id,
          actorId: actor.id,
          apifyActorId: actor.apifyActorId,
          name: actor.title ?? actor.actorName,
          slug: `${actor.username}/${actor.actorName}`,
          date: selectedDay,
          runs: runs ?? actorDays.reduce((total, item) => total + item.runs, 0),
          successfulRuns:
            successfulRuns ??
            actorDays.reduce((total, item) => total + Number(item.successfulRuns ?? 0), 0),
          failedRuns:
            failedRuns ??
            actorDays.reduce((total, item) => total + Number(item.failedRuns ?? 0), 0),
          results:
            results ?? actorDays.reduce((total, item) => total + Number(item.resultCount ?? 0), 0),
          activeUsers: activeUsers ?? null,
          directCostUsd: null,
          allocatedCostUsd: null,
          revenueUsd: null,
          netProfitUsd: null,
          margin: null,
          costSource: null,
          costShare: null,
        };
      })
      .filter((row) => row.runs || row.results || row.activeUsers);
  }, [ledger, revenueActorMap, scopedActors, selectedDay, selectedFrom, selectedTo]);

  const usageRows = useMemo(
    () =>
      tableView === "total" || selectedDay
        ? usageTotalRows
        : usagePeriodRows(scopedActors, selectedFrom, selectedTo, tableView),
    [scopedActors, selectedDay, selectedFrom, selectedTo, tableView, usageTotalRows],
  );

  const financialRows =
    tableView === "daily"
      ? dailyFinancialLedgerRows(ledger)
      : tableView === "weekly"
        ? weeklyFinancialLedgerRows(ledger)
        : actorFinancialTotalRows(revenue?.actors ?? []);
  const directCostForShare = financialRows.reduce(
    (total, row) => total + (row.directCostUsd ?? 0),
    0,
  );
  const baseRows =
    kind === "usage"
      ? usageRows
      : financialRows.map((row) => ({
          ...row,
          costShare:
            row.directCostUsd == null || directCostForShare <= 0
              ? null
              : (row.directCostUsd / directCostForShare) * 100,
        }));
  const filteredRows = baseRows.filter((row) =>
    `${row.name} ${row.slug}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const valueForSort = (row: TableRow, key: SortKey): number | string => {
    if (key === "name") return row.name.toLowerCase();
    if (key === "date") return row.date ?? "";
    if (key === "runs") return row.runs;
    if (key === "success") return row.successfulRuns;
    if (key === "failed") return row.failedRuns;
    if (key === "results") return row.results;
    if (key === "users") return row.activeUsers ?? -1;
    if (key === "direct") return row.directCostUsd ?? -1;
    if (key === "allocated") return row.allocatedCostUsd ?? -1;
    if (key === "revenue") return row.revenueUsd ?? -1;
    if (key === "profit") return row.netProfitUsd ?? -1;
    if (key === "share") return row.costShare ?? -1;
    return row.margin ?? -1;
  };
  const sortedRows = [...filteredRows].sort((left, right) => {
    const a = valueForSort(left, sortKey);
    const b = valueForSort(right, sortKey);
    const result = typeof a === "string" ? a.localeCompare(String(b)) : Number(a) - Number(b);
    return sortDirection === "asc" ? result : -result;
  });
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const usageTotals = usageTotalRows.reduce(
    (total, row) => ({
      runs: total.runs + row.runs,
      successful: total.successful + row.successfulRuns,
      failed: total.failed + row.failedRuns,
      results: total.results + row.results,
      users: total.users + (row.activeUsers ?? 0),
    }),
    { runs: 0, successful: 0, failed: 0, results: 0, users: 0 },
  );
  const successRate = usageTotals.runs ? (usageTotals.successful / usageTotals.runs) * 100 : 0;

  const currentFinancial = revenue?.comparison.current;
  const previousFinancial = revenue?.comparison.previous;
  const directCost = currentFinancial?.costUsd ?? 0;
  const allocatedCost = currentFinancial?.allocatedCostUsd ?? 0;
  const revenueTotal = currentFinancial?.revenueUsd ?? 0;
  const netProfit = currentFinancial?.netProfitUsd ?? 0;
  const overhead = Math.max(0, allocatedCost - directCost);
  const revenueCoveredDays =
    currentFinancial?.revenueCoveredDays ??
    revenue?.coverage.revenueCoveredRows ??
    revenue?.coverage.actorsWithRevenue ??
    0;
  const activeUsersCoveredDays =
    currentFinancial?.activeUsersCoveredDays ?? revenue?.coverage.activeUsersCoveredRows ?? 0;
  const netProfitAvailable = Boolean(currentFinancial?.allocatedCoveredDays && revenueCoveredDays);
  const margin = revenueTotal && netProfitAvailable ? (netProfit / revenueTotal) * 100 : null;
  const currentUsage = payload.accountUsage?.currentPeriod?.usage;
  const accountSpendAvailable = Boolean(currentUsage || currentFinancial?.allocatedCoveredDays);
  const accountSpend = Number(
    currentUsage?.totalUsageCreditsUsdAfterVolumeDiscount ?? allocatedCost,
  );
  const cycleStart = currentUsage?.usageCycle.startAt
    ? new Date(currentUsage.usageCycle.startAt)
    : null;
  const cycleEnd = currentUsage?.usageCycle.endAt ? new Date(currentUsage.usageCycle.endAt) : null;
  const elapsedDays = cycleStart
    ? Math.max(1, Math.ceil((Date.now() - cycleStart.getTime()) / DAY_MS))
    : 1;
  const cycleDays =
    cycleStart && cycleEnd
      ? Math.max(1, Math.ceil((cycleEnd.getTime() - cycleStart.getTime()) / DAY_MS))
      : elapsedDays;
  const forecast = (accountSpend / elapsedDays) * cycleDays;

  const usageSeries =
    payload.report?.points.map((point) => ({
      period: point.period,
      label: chartPeriodLabel(point.period, granularity),
      runs: point.runs,
      successful: point.successfulRuns,
      failed: point.failedRuns,
    })) ?? [];
  const financialSeries = (payload.report?.points ?? []).map((point) => ({
    period: point.period,
    label: chartPeriodLabel(point.period, granularity),
    directCostUsd: point.usageCostUsd,
    allocatedCostUsd: point.allocatedCostUsd,
    revenueUsd: point.revenueUsd,
    netProfitUsd: point.netProfitUsd,
  }));
  const accountCostByPeriod = new Map<string, number>();
  for (const [date, rows] of Object.entries(
    payload.accountUsage?.calendarMonth?.dailyServiceUsage ?? {},
  )) {
    if (date < selectedFrom || date > selectedTo) continue;
    const period =
      granularity === "day"
        ? date
        : granularity === "week"
          ? financialWeekKey(date)
          : date.slice(0, 7);
    const total = rows.reduce(
      (sum, row) => sum + Number(row.amountAfterVolumeDiscountUsd ?? row.baseAmountUsd ?? 0),
      0,
    );
    accountCostByPeriod.set(period, (accountCostByPeriod.get(period) ?? 0) + total);
  }
  const financialByPeriod = new Map(financialSeries.map((point) => [point.period, point]));
  const costPeriods = [
    ...new Set([...financialByPeriod.keys(), ...accountCostByPeriod.keys()]),
  ].sort();
  let cumulativeAccountCost = 0;
  const costSeries = costPeriods.map((period) => {
    const point = financialByPeriod.get(period) ?? {
      period,
      label: chartPeriodLabel(period, granularity),
      directCostUsd: null,
      allocatedCostUsd: null,
      revenueUsd: null,
      netProfitUsd: null,
    };
    const accountCost = accountCostByPeriod.get(period) ?? point.allocatedCostUsd;
    if (accountCost != null) cumulativeAccountCost += accountCost;
    return {
      ...point,
      accountCostUsd:
        accountCost == null ? null : mode === "cumulative" ? cumulativeAccountCost : accountCost,
    };
  });
  const serviceCategorySeries = [
    ...resolveCurrentServiceEntries(payload.accountUsage).reduce((groups, [key, usage]) => {
      const group = serviceGroup(key);
      const amount = Number(usage.amountAfterVolumeDiscountUsd ?? usage.baseAmountUsd ?? 0);
      groups.set(group, (groups.get(group) ?? 0) + amount);
      return groups;
    }, new Map<string, number>()),
  ]
    .map(([category, costUsd]) => ({ category, costUsd }))
    .sort((left, right) => right.costUsd - left.costUsd);
  const serviceSeries = [
    {
      key: "costUsd",
      label: "Cost USD",
      color: "var(--color-signal-orange)",
      format: { unit: "currency" as const, currency: "USD" },
    },
  ] as const;
  const trendData =
    kind === "usage" ? usageSeries : kind === "costs" ? costSeries : financialSeries;

  const activeFilters =
    Number(selectedActorIds.length > 0) +
    Number(preset !== "30") +
    Number(granularity !== "day") +
    Number(mode !== "absolute") +
    Number(!compare) +
    Number(Boolean(selectedDay));
  const advancedFilterCount =
    Number(granularity !== "day") +
    Number(mode !== "absolute") +
    Number(!compare) +
    Number(Boolean(selectedDay));

  const resetFilters = () => {
    setCustomRangeOpen(false);
    updateUrl({
      actors: null,
      from: utcTodayOffset(-29),
      to: utcTodayOffset(),
      granularity: null,
      mode: null,
      compare: null,
      day: null,
      table: null,
    });
  };

  const renderFilters = () => (
    <>
      <FilterField label="Actors" className="w-full shrink-0 sm:w-48">
        <ActorPicker
          actors={payload.items}
          selectedIds={controlActorIds}
          onChange={(ids) => updateUrl({ actors: ids.length ? ids.join(",") : null })}
        />
      </FilterField>
      <FilterField label="Period" className="w-full shrink-0 sm:w-44">
        <Select
          value={customRangeOpen ? "custom" : controlPreset}
          onValueChange={(value) => {
            if (value === "custom") {
              setCustomRangeOpen(true);
              return;
            }
            setCustomRangeOpen(false);
            const rangeDays = Number(value);
            updateUrl({ from: utcTodayOffset(-(rangeDays - 1)), to: utcTodayOffset(), day: null });
          }}
        >
          <SelectTrigger className="h-10 w-full min-w-40" aria-label="Date range">
            <CalendarDays className="h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {controlPreset === "3" ? <SelectItem value="3">Last 3 days</SelectItem> : null}
            {controlPreset === "6" ? <SelectItem value="6">Last 6 days</SelectItem> : null}
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
      </FilterField>
      {controlPreset === "custom" || customRangeOpen ? (
        <FilterField label="Custom dates" className="w-full shrink-0 sm:w-[19rem]">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="h-10 min-w-0 flex-1 sm:w-36"
              value={controlFrom}
              max={controlTo}
              onChange={(event) => updateUrl({ from: event.target.value, day: null })}
              aria-label="Start date"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              className="h-10 min-w-0 flex-1 sm:w-36"
              value={controlTo}
              min={controlFrom}
              max={utcTodayOffset()}
              onChange={(event) => updateUrl({ to: event.target.value, day: null })}
              aria-label="End date"
            />
          </div>
        </FilterField>
      ) : null}
      <div className="flex items-center gap-2 self-end">
        {activeFilters ? (
          <Button type="button" variant="ghost" size="sm" className="h-10" onClick={resetFilters}>
            <X className="h-4 w-4" /> Reset
          </Button>
        ) : null}
      </div>
    </>
  );

  // Let the browser resolve the active token so the chart is theme-aware
  // without waiting for React to hydrate the ThemeProvider.
  const gridColor = "hsl(var(--border) / 0.55)";
  const tickColor = "var(--color-muted-foreground)";
  const sortHeader = (key: SortKey, label: string) => (
    <button
      type="button"
      className="hover:text-foreground inline-flex items-center gap-1.5"
      onClick={() => {
        if (sortKey === key) setSortDirection((value) => (value === "desc" ? "asc" : "desc"));
        else {
          setSortKey(key);
          setSortDirection("desc");
        }
        setPage(1);
      }}
    >
      {label}
      <ArrowDownUp
        className={`h-3 w-3 ${sortKey === key ? "text-signal-blue" : "text-muted-foreground/60"}`}
      />
    </button>
  );

  return (
    <div className="space-y-5">
      <DashboardFilterRail
        label="Financial analytics filters"
        className="border-signal-blue/20 bg-card/95 rounded-sm border"
      >
        <CardContent className="grid gap-3 p-3 xl:grid-cols-[minmax(13rem,0.7fr)_minmax(0,3fr)] xl:items-end">
          <DashboardFilterSummary
            label="Analytics scope"
            items={[
              selectedActorIds.length
                ? `${selectedActorIds.length} selected Actors`
                : "All workspace Actors",
              `${selectedFrom} → ${selectedTo} UTC`,
              selectedDay ? `Inspecting ${selectedDay}` : "Range view",
            ]}
            onReset={activeFilters ? resetFilters : undefined}
          />
          <ResponsiveFilterBar
            renderFilters={renderFilters}
            activeCount={activeFilters}
            mobileLabel="Analytics filters"
            className="min-w-0 flex-wrap items-end justify-start xl:justify-end"
          />
        </CardContent>
      </DashboardFilterRail>

      <details className="border-border bg-card rounded-md border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">How to read these figures</summary>
        <div className="text-muted-foreground mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-2">
          {kind === "usage" ? (
            <>
              <p>
                <strong className="text-foreground">Runs</strong> count Actor executions in the
                selected period.
              </p>
              <p>
                <strong className="text-foreground">Results</strong> count items produced by those
                runs.
              </p>
            </>
          ) : (
            <>
              <p>
                <strong className="text-foreground">Account spend</strong> covers the current Apify
                billing cycle. It may differ from the selected chart period.
              </p>
              <p>
                <strong className="text-foreground">Direct cost</strong> is the cost attributed to
                Actor activity in the selected period.
              </p>
              <p>
                <strong className="text-foreground">Allocated cost</strong> adds a share of
                workspace overhead to direct cost.
              </p>
              <p>
                <strong className="text-foreground">Unavailable</strong> means the required source
                data is missing. It does not mean zero.
              </p>
            </>
          )}
        </div>
      </details>

      {kind !== "usage" && payload.meta?.stale ? (
        <DashboardAsyncState
          status="warning"
          title="Showing the latest cached financial snapshot"
          description={
            payload.meta.syncedAt
              ? `Console enrichment is being refreshed. The last synchronized snapshot was ${new Date(payload.meta.syncedAt).toLocaleString("en-US")}; direct Actor usage remains available.`
              : "Console enrichment is being refreshed. Direct Actor usage and any available cost coverage remain visible while the latest snapshot is fetched."
          }
        />
      ) : null}

      {payload.accountUsage?.credentialIssue && kind !== "usage" ? (
        <Card className="border-signal-orange/50 bg-signal-orange/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <ShieldAlert className="text-signal-orange mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Console analytics need attention</p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {payload.accountUsage.credentialIssue.message} API-key usage and direct Actor
                  costs remain available independently.
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <Link href={connectionHref}>Apify connection</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {kind !== "usage" &&
      revenue?.coverage.rows &&
      (revenue.coverage.costCoveredRows < revenue.coverage.rows ||
        revenue.coverage.allocatedCostCoveredRows < revenue.coverage.rows ||
        (revenue.coverage.revenueCoveredRows ?? revenue.coverage.rows) < revenue.coverage.rows) ? (
        <Card className="border-signal-blue/35 bg-signal-blue/5">
          <CardContent className="flex gap-3 p-5">
            <ShieldAlert className="text-signal-blue mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Partial financial coverage</p>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                Direct cost covers {revenue.coverage.costCoveredRows.toLocaleString("en-US")} of{" "}
                {revenue.coverage.rows.toLocaleString("en-US")} Actor-days; allocated cost covers{" "}
                {revenue.coverage.allocatedCostCoveredRows.toLocaleString("en-US")}; revenue covers{" "}
                {(revenue.coverage.revenueCoveredRows ?? 0).toLocaleString("en-US")}. Available
                subtotals remain visible, while missing values are never converted to zero.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {kind === "usage" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Runs"
            value={usageTotals.runs.toLocaleString("en-US")}
            detail={`${days} day selected range`}
            icon={Activity}
          />
          <MetricCard
            label="Successful"
            value={usageTotals.successful.toLocaleString("en-US")}
            detail={`${successRate.toFixed(1)}% success rate`}
            icon={TrendingUp}
          />
          <MetricCard
            label="Failed"
            value={usageTotals.failed.toLocaleString("en-US")}
            detail="Failed Actor runs"
            icon={ShieldAlert}
          />
          <MetricCard
            label="Results"
            value={compact.format(usageTotals.results)}
            detail="Dataset results produced"
            icon={Gauge}
          />
          <MetricCard
            label="Active users"
            value={compact.format(usageTotals.users)}
            detail="Synchronized owner analytics"
            icon={Users}
          />
        </div>
      ) : kind === "costs" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            label="Account spend"
            value={accountSpendAvailable ? money.format(accountSpend) : "Unavailable"}
            detail="Current Apify billing cycle"
            icon={CircleDollarSign}
          />
          <MetricCard
            label="Previous-period spend"
            value={
              previousFinancial?.allocatedCoveredDays
                ? money.format(previousFinancial.allocatedCostUsd)
                : previousFinancial?.costCoveredDays
                  ? money.format(previousFinancial.costUsd)
                  : "Unavailable"
            }
            detail="Matching preceding date range"
            icon={CalendarDays}
          />
          <MetricCard
            label="Direct Actor cost"
            value={currentFinancial?.costCoveredDays ? money.format(directCost) : "Unavailable"}
            detail="Authoritative Actor-day billing"
            icon={Activity}
          />
          <MetricCard
            label="Allocated cost"
            value={
              currentFinancial?.allocatedCoveredDays ? money.format(allocatedCost) : "Unavailable"
            }
            detail="Direct cost plus shared overhead"
            icon={Gauge}
          />
          <MetricCard
            label="Shared overhead"
            value={currentFinancial?.allocatedCoveredDays ? money.format(overhead) : "Unavailable"}
            detail="Calculated, not an Actor charge"
            icon={Users}
          />
          <MetricCard
            label="Forecast"
            value={accountSpendAvailable ? money.format(forecast) : "Unavailable"}
            detail="Projected billing-cycle spend"
            icon={TrendingUp}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Revenue"
            value={revenueCoveredDays ? money.format(revenueTotal) : "Unavailable"}
            detail={
              compare && previousFinancial
                ? `${percentage(revenueTotal, previousFinancial.revenueUsd)?.toFixed(1) ?? "—"}% vs previous`
                : "Selected range"
            }
            icon={TrendingUp}
          />
          <MetricCard
            label="Direct cost"
            value={currentFinancial?.costCoveredDays ? money.format(directCost) : "Unavailable"}
            detail="Actor execution cost"
            icon={Activity}
          />
          <MetricCard
            label="Allocated cost"
            value={
              currentFinancial?.allocatedCoveredDays ? money.format(allocatedCost) : "Unavailable"
            }
            detail="Includes workspace overhead"
            icon={CircleDollarSign}
          />
          <MetricCard
            label="Net profit"
            value={netProfitAvailable ? money.format(netProfit) : "Unavailable"}
            detail={margin == null ? "Margin unavailable" : `${margin.toFixed(1)}% margin`}
            icon={Gauge}
          />
          <MetricCard
            label="Active users"
            value={
              activeUsersCoveredDays
                ? compact.format(currentFinancial?.activeUsers ?? 0)
                : "Unavailable"
            }
            detail={`${(currentFinancial?.runs ?? 0).toLocaleString("en-US")} runs`}
            icon={Users}
          />
        </div>
      )}

      <FinancialTrendChart
        key={kind}
        kind={kind}
        points={trendData}
        granularity={granularity}
        mode={mode}
        compare={compare}
        from={selectedFrom}
        to={selectedTo}
        selectedDay={selectedDay}
        advancedCount={advancedFilterCount}
        onSettingsChange={updateUrl}
        onInspectDay={(day) => updateUrl({ day, table: day && kind === "costs" ? "daily" : null })}
      />

      {kind === "costs" ? (
        <Card>
          <CardHeader>
            <CardTitle>Current billing-cycle service categories</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              Apify account charges grouped into compute, proxy, transfer, storage, and other
              services.
            </p>
          </CardHeader>
          <CardContent>
            <ChartFrame
              ariaLabel="Current billing-cycle service categories"
              series={serviceSeries}
              status={serviceCategorySeries.length ? "ready" : "empty"}
              statusMessage="Service-level billing is unavailable. Add a valid Console credential to enrich this breakdown."
              options={{
                showSeriesControls: false,
                allowAxisLabels: false,
                allowDataLabels: false,
              }}
              chartClassName="min-w-0"
            >
              {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(240, serviceCategorySeries.length * 46)}
                  debounce={0}
                >
                  <BarChart
                    data={serviceCategorySeries}
                    layout="vertical"
                    margin={{ left: 12, right: 24 }}
                    accessibilityLayer
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                    <XAxis
                      type="number"
                      hide={!axisLabelsVisible}
                      tick={{ fontSize: 11, fill: tickColor }}
                      stroke={tickColor}
                      tickFormatter={(value) => money.format(Number(value))}
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      hide={!axisLabelsVisible}
                      width={108}
                      tick={{ fontSize: 11, fill: tickColor }}
                      stroke={tickColor}
                    />
                    <Tooltip content={<ChartTooltip series={serviceSeries} />} cursor={false} />
                    <Bar
                      dataKey="costUsd"
                      name="Cost USD"
                      hide={!visibleSeries.has("costUsd")}
                      fill="var(--color-signal-orange)"
                      radius={[0, 2, 2, 0]}
                      label={
                        dataLabelsVisible
                          ? { fill: "var(--color-foreground)", fontSize: 10, position: "right" }
                          : false
                      }
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartFrame>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>
              {selectedDay
                ? kind === "usage"
                  ? `Actor usage on ${selectedDay}`
                  : kind === "costs"
                    ? `Actor costs on ${selectedDay}`
                    : `Actor revenue on ${selectedDay}`
                : kind === "usage"
                  ? "Usage by Actor"
                  : kind === "costs"
                    ? "Cost by Actor"
                    : "Revenue by Actor"}
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {selectedDay
                ? kind === "revenue"
                  ? "Complete UTC-day breakdown. Open any Actor to continue in its details page."
                  : `Complete Actor breakdown for ${selectedDay} UTC.`
                : tableView === "daily"
                  ? "One row per Actor and UTC date."
                  : tableView === "weekly"
                    ? "One row per Actor and Monday–Sunday UTC week."
                    : "One aggregated row per Actor for the selected range."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {kind !== "revenue" ? (
              <div className="flex rounded-sm border p-1" role="group" aria-label="Table grouping">
                <Button
                  type="button"
                  size="sm"
                  variant={tableView === "total" ? "secondary" : "ghost"}
                  onClick={() => updateUrl({ table: null, day: null })}
                >
                  Range totals
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={tableView === "daily" ? "secondary" : "ghost"}
                  onClick={() => updateUrl({ table: "daily", day: null })}
                >
                  Daily
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={tableView === "weekly" ? "secondary" : "ghost"}
                  onClick={() => updateUrl({ table: "weekly", day: null })}
                >
                  Weekly
                </Button>
              </div>
            ) : null}
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search Actors"
                className="w-52 pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!sortedRows.length}
              onClick={() => downloadCsv(kind, sortedRows)}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {kind === "costs" && revenue?.ledgerTruncated && tableView !== "total" && !selectedDay ? (
            <div className="border-signal-blue/35 bg-signal-blue/8 mb-4 rounded-sm border px-4 py-3 text-xs leading-5">
              Showing the newest {ledger.length.toLocaleString("en-US")} of{" "}
              {(revenue.ledgerTotal ?? ledger.length).toLocaleString("en-US")} Actor-day rows.
              Select a date to load its complete Actor breakdown.
            </div>
          ) : null}
          {visibleRows.length ? (
            <>
              <div className="space-y-3 md:hidden">
                {visibleRows.map((row) => (
                  <article key={row.key} className="border-border rounded-sm border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {row.date ? (
                          <p className="text-muted-foreground font-mono text-[10px]">
                            {periodLabel(row.date, tableView)} UTC
                          </p>
                        ) : null}
                        <Link
                          href={`${actorHrefPrefix}/${row.actorId}`}
                          className="mt-1 block truncate font-semibold"
                          target={kind === "revenue" ? "_blank" : undefined}
                          rel={kind === "revenue" ? "noreferrer" : undefined}
                        >
                          {row.name}
                          {kind === "revenue" ? (
                            <>
                              <ExternalLink className="text-muted-foreground ml-1 inline h-3 w-3" />
                              <span className="sr-only"> (opens Actor details in a new tab)</span>
                            </>
                          ) : null}
                        </Link>
                        <p className="text-muted-foreground truncate font-mono text-[10px]">
                          {row.slug}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-semibold">
                        {kind === "usage"
                          ? `${row.runs} runs`
                          : kind === "costs"
                            ? row.directCostUsd == null
                              ? "Unavailable"
                              : money.format(row.directCostUsd)
                            : row.revenueUsd == null
                              ? "Unavailable"
                              : money.format(row.revenueUsd)}
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      {kind === "usage" ? (
                        <>
                          <div>
                            <dt className="text-muted-foreground">Successful</dt>
                            <dd className="mt-1 font-mono">{row.successfulRuns}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Failed</dt>
                            <dd className="mt-1 font-mono">{row.failedRuns}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Results</dt>
                            <dd className="mt-1 font-mono">{row.results}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Active users</dt>
                            <dd className="mt-1 font-mono">{row.activeUsers ?? "—"}</dd>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <dt className="text-muted-foreground">Allocated cost</dt>
                            <dd className="mt-1 font-mono">
                              {row.allocatedCostUsd == null
                                ? "Unavailable"
                                : money.format(row.allocatedCostUsd)}
                            </dd>
                          </div>
                          {kind === "costs" ? (
                            <div>
                              <dt className="text-muted-foreground">Spend share</dt>
                              <dd className="mt-1 font-mono">
                                {row.costShare == null ? "—" : `${row.costShare.toFixed(1)}%`}
                              </dd>
                            </div>
                          ) : null}
                          {kind === "revenue" ? (
                            <>
                              <div>
                                <dt className="text-muted-foreground">Net profit</dt>
                                <dd className="mt-1 font-mono">
                                  {row.netProfitUsd == null
                                    ? "Unavailable"
                                    : money.format(row.netProfitUsd)}
                                  <Delta
                                    current={row.netProfitUsd}
                                    previous={
                                      tableView === "total" ? row.previousNetProfitUsd : null
                                    }
                                  />
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Margin</dt>
                                <dd className="mt-1 font-mono">
                                  {row.margin == null ? "—" : `${row.margin.toFixed(1)}%`}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Results</dt>
                                <dd className="mt-1 font-mono">{row.results}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Active users</dt>
                                <dd className="mt-1 font-mono">{row.activeUsers ?? "—"}</dd>
                              </div>
                            </>
                          ) : null}
                          <div>
                            <dt className="text-muted-foreground">Runs</dt>
                            <dd className="mt-1 font-mono">
                              {row.runs}
                              <Delta
                                current={row.runs}
                                previous={tableView === "total" ? row.previousRuns : null}
                              />
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto rounded-sm border md:block">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead className="bg-muted/55 text-muted-foreground">
                    <tr>
                      {tableView !== "total" && kind !== "revenue" ? (
                        <th className="px-4 py-3 text-left font-medium">
                          {sortHeader("date", tableView === "weekly" ? "Week" : "Date")}
                        </th>
                      ) : null}
                      <th className="px-4 py-3 text-left font-medium">
                        {sortHeader("name", "Actor")}
                      </th>
                      {kind === "usage" ? (
                        <>
                          <th className="px-3 py-3 text-right font-medium">
                            {sortHeader("runs", "Runs")}
                          </th>
                          <th className="px-3 py-3 text-right font-medium">
                            {sortHeader("success", "Successful")}
                          </th>
                          <th className="px-3 py-3 text-right font-medium">
                            {sortHeader("failed", "Failed")}
                          </th>
                          <th className="px-3 py-3 text-right font-medium">
                            {sortHeader("results", "Results")}
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            {sortHeader("users", "Active users")}
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-3 text-right font-medium">
                            {sortHeader("direct", "Direct cost")}
                          </th>
                          <th className="px-3 py-3 text-right font-medium">
                            {sortHeader("allocated", "Allocated cost")}
                          </th>
                          {kind === "costs" ? (
                            <th className="px-3 py-3 text-right font-medium">
                              {sortHeader("share", "Spend share")}
                            </th>
                          ) : null}
                          {kind === "revenue" ? (
                            <>
                              <th className="px-3 py-3 text-right font-medium">
                                {sortHeader("revenue", "Revenue")}
                              </th>
                              <th className="px-3 py-3 text-right font-medium">
                                {sortHeader("profit", "Net profit")}
                              </th>
                              <th className="px-3 py-3 text-right font-medium">
                                {sortHeader("margin", "Margin")}
                              </th>
                            </>
                          ) : null}
                          <th className="px-3 py-3 text-right font-medium">
                            {sortHeader("runs", "Runs")}
                          </th>
                          <th className="px-3 py-3 text-right font-medium">
                            {sortHeader("results", "Results")}
                          </th>
                          {kind === "revenue" ? (
                            <th className="px-4 py-3 text-right font-medium">
                              {sortHeader("users", "Active users")}
                            </th>
                          ) : null}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {visibleRows.map((row) => (
                      <tr key={row.key}>
                        {tableView !== "total" && kind !== "revenue" ? (
                          <td className="px-4 py-3 font-mono text-xs">
                            {row.date ? periodLabel(row.date, tableView) : "—"}
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <Link
                            href={`${actorHrefPrefix}/${row.actorId}`}
                            className="hover:text-signal-blue inline-flex items-center gap-1.5 font-semibold"
                            target={kind === "revenue" ? "_blank" : undefined}
                            rel={kind === "revenue" ? "noreferrer" : undefined}
                          >
                            {row.name}
                            {kind === "revenue" ? (
                              <>
                                <ExternalLink className="text-muted-foreground h-3 w-3 shrink-0" />
                                <span className="sr-only">(opens Actor details in a new tab)</span>
                              </>
                            ) : null}
                          </Link>
                          <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                            {row.slug}
                          </p>
                        </td>
                        {kind === "usage" ? (
                          <>
                            <td className="px-3 py-3 text-right font-mono">
                              {row.runs.toLocaleString("en-US")}
                            </td>
                            <td className="text-signal-green px-3 py-3 text-right font-mono">
                              {row.successfulRuns.toLocaleString("en-US")}
                            </td>
                            <td className="text-signal-orange px-3 py-3 text-right font-mono">
                              {row.failedRuns.toLocaleString("en-US")}
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              {row.results.toLocaleString("en-US")}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {row.activeUsers?.toLocaleString("en-US") ?? "—"}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-3 text-right font-mono">
                              {row.directCostUsd == null
                                ? "Unavailable"
                                : money.format(row.directCostUsd)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              {row.allocatedCostUsd == null
                                ? "Unavailable"
                                : money.format(row.allocatedCostUsd)}
                            </td>
                            {kind === "costs" ? (
                              <td className="px-3 py-3 text-right font-mono">
                                {row.costShare == null ? "—" : `${row.costShare.toFixed(1)}%`}
                              </td>
                            ) : null}
                            {kind === "revenue" ? (
                              <>
                                <td className="px-3 py-3 text-right font-mono">
                                  {row.revenueUsd == null
                                    ? "Unavailable"
                                    : money.format(row.revenueUsd)}
                                  <Delta
                                    current={row.revenueUsd}
                                    previous={tableView === "total" ? row.previousRevenueUsd : null}
                                  />
                                </td>
                                <td className="px-3 py-3 text-right font-mono">
                                  {row.netProfitUsd == null
                                    ? "Unavailable"
                                    : money.format(row.netProfitUsd)}
                                  <Delta
                                    current={row.netProfitUsd}
                                    previous={
                                      tableView === "total" ? row.previousNetProfitUsd : null
                                    }
                                  />
                                </td>
                                <td className="px-3 py-3 text-right font-mono">
                                  {row.margin == null ? "—" : `${row.margin.toFixed(1)}%`}
                                </td>
                              </>
                            ) : null}
                            <td className="px-3 py-3 text-right font-mono">
                              {row.runs.toLocaleString("en-US")}{" "}
                              {kind === "revenue" ? (
                                <Delta
                                  current={row.runs}
                                  previous={tableView === "total" ? row.previousRuns : null}
                                />
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              {row.results.toLocaleString("en-US")}
                            </td>
                            {kind === "revenue" ? (
                              <td className="px-4 py-3 text-right font-mono">
                                {row.activeUsers?.toLocaleString("en-US") ?? "—"}
                              </td>
                            ) : null}
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={safePage}
                pageSize={pageSize}
                total={sortedRows.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </>
          ) : (
            <div className="text-muted-foreground flex h-48 items-center justify-center rounded-sm border border-dashed px-6 text-center text-sm">
              No Actors match this scope.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
