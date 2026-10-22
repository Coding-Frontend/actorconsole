"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, ChartTooltip } from "@/components/charts/chart-system";
import {
  Activity,
  ArrowDownRight,
  ArrowDownUp,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  ChevronsUpDown,
  CircleDollarSign,
  DollarSign,
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
import { Input } from "@/components/ui/input";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardUrlTabs, ResponsiveFilterBar } from "@/components/dashboard/dashboard-workbench";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ItemsPerPageSelect } from "@/components/ui/items-per-page";
import { DEFAULT_PAGE_SIZE } from "@/lib/page-size";
import type { DashboardResponseMeta } from "@/lib/dashboard-state";

interface ServiceUsage {
  serviceKey?: string;
  quantity: number;
  baseAmountUsd: number;
  baseUnitPriceUsd: number;
  amountAfterVolumeDiscountUsd?: number;
}

interface AccountMonthlyUsage {
  usageCycle: { startAt: string; endAt: string };
  monthlyServiceUsage: Record<string, ServiceUsage>;
  dailyServiceUsages: Array<{
    date: string;
    serviceUsage: Record<string, ServiceUsage>;
    totalUsageCreditsUsd: number;
  }>;
  totalUsageCreditsUsdBeforeVolumeDiscount: number;
  totalUsageCreditsUsdAfterVolumeDiscount: number;
}

interface AccountLimits {
  monthlyUsageCycle: { startAt: string; endAt: string };
  limits: { maxMonthlyUsageUsd: number };
  current: { monthlyUsageUsd: number };
}

interface ActorUsageItem {
  actorId: string;
  name: string;
  title: string | null;
  username: string;
  pictureUrl: string | null;
  totalUsageUsd: number;
}

export interface UsageCostsPayload {
  meta?: DashboardResponseMeta;
  items: Array<{
    id: string;
    apifyActorId: string;
    title: string | null;
    actorName: string;
    username: string;
    lastRunSyncAt: string | null;
    lastInsightSyncAt?: string | null;
    insightSyncStatus?: string | null;
    insightSyncError?: string | null;
    usageDaily: Array<{
      date: string;
      usageCostUsd: number | string;
      runs: number;
      successfulRuns?: number;
      failedRuns?: number;
      abortedRuns?: number;
      timedOutRuns?: number;
      resultCount?: number;
    }>;
  }>;
  latestSyncAt: string | null;
  accountUsage: {
    syncedAt?: string;
    monthly: Record<
      string,
      {
        monthStartAt: string;
        monthEndAt?: string;
        serviceUsages: Record<string, ServiceUsage>;
      }
    > | null;
    actors: { current: ActorUsageItem[] | null; previous: ActorUsageItem[] | null };
    calendarMonth: {
      dailyServiceUsage: Record<string, ServiceUsage[]>;
      monthlyServiceUsage?: Record<string, ServiceUsage>;
    } | null;
    currentServices: Record<string, ServiceUsage[]> | null;
    currentPeriod?: {
      usage: AccountMonthlyUsage | null;
      limits: AccountLimits | null;
    };
    unavailable: number;
    credentialIssue?: { code: string; message: string } | null;
  } | null;
  filters?: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    actorIds: string[];
    granularity: "day" | "week" | "month";
    mode: "absolute" | "cumulative";
    day?: string | null;
    timeZone: string;
  };
  report?: {
    granularity: "day" | "week" | "month";
    mode: "absolute" | "cumulative";
    points: Array<{
      period: string;
      usageCostUsd: number;
      allocatedCostUsd: number;
      revenueUsd: number;
      profitUsd: number;
      netProfitUsd: number;
      runs: number;
      successfulRuns?: number;
      failedRuns?: number;
    }>;
  };
  revenue?: {
    syncedAt: string | null;
    daily: Array<{
      date: string;
      costUsd: number;
      allocatedCostUsd: number;
      revenueUsd: number;
      profitUsd: number;
      netProfitUsd: number;
      runs: number;
      results: number;
      activeUsers: number;
    }>;
    monthly: Array<{
      month: string;
      costUsd: number;
      allocatedCostUsd: number;
      revenueUsd: number;
      profitUsd: number;
      netProfitUsd: number;
      runs: number;
      results: number;
      activeUsers: number;
    }>;
    actors: Array<{
      id: string;
      apifyActorId: string;
      title: string | null;
      actorName: string;
      username: string;
      costUsd: number;
      allocatedCostUsd: number;
      revenueUsd: number;
      profitUsd: number;
      netProfitUsd: number;
      margin: number | null;
      runs: number;
      successfulRuns?: number;
      failedRuns?: number;
      results: number;
      activeUsers: number;
      previousRevenueUsd: number;
      previousNetProfitUsd: number;
      previousRuns: number;
      previousResults: number;
      costAvailable: boolean;
      allocatedCostAvailable: boolean;
      actorDays?: number;
      costCoveredDays?: number;
      allocatedCoveredDays?: number;
      revenueCoveredDays?: number;
      activeUsersCoveredDays?: number;
    }>;
    ledger: Array<{
      actorId: string;
      apifyActorId: string;
      title: string | null;
      actorName: string;
      username: string;
      date: string;
      directCostUsd: number | null;
      allocatedCostUsd: number | null;
      revenueUsd: number | null;
      profitUsd: number | null;
      netProfitUsd: number | null;
      margin: number | null;
      runs: number;
      successfulRuns?: number;
      failedRuns?: number;
      results: number;
      activeUsers: number | null;
      costSource: "run-data" | "owner-analytics" | "unavailable";
      capturedAt: string | null;
    }>;
    ledgerTotal?: number;
    ledgerTruncated?: boolean;
    comparison: {
      current: FinancialTotals;
      previous: FinancialTotals;
    };
    coverage: {
      workspaceActors: number;
      selectedActors: number;
      actorsWithRevenue: number;
      rows: number;
      costCoveredRows: number;
      allocatedCostCoveredRows: number;
      revenueCoveredRows?: number;
      activeUsersCoveredRows?: number;
      failedActorSyncs: number;
      officialCurrentMonthCoveredActors: number;
    };
    unavailableActors: number;
  } | null;
}

interface FinancialTotals {
  costUsd: number;
  allocatedCostUsd: number;
  revenueUsd: number;
  profitUsd: number;
  netProfitUsd: number;
  runs: number;
  successfulRuns?: number;
  failedRuns?: number;
  results: number;
  activeUsers: number;
  costCoveredDays: number;
  allocatedCoveredDays: number;
  revenueCoveredDays?: number;
  activeUsersCoveredDays?: number;
}

type ActorRow = {
  id: string;
  title: string;
  username: string;
  actorName: string;
  cost: number;
  previousCost: number | null;
  runs: number;
  previousRuns: number;
  share: number;
};

export type RevenueActorRow = NonNullable<UsageCostsPayload["revenue"]>["actors"][number] & {
  share: number;
};

export function resolveCurrentServiceEntries(account: UsageCostsPayload["accountUsage"]) {
  const reported = Object.entries(account?.currentPeriod?.usage?.monthlyServiceUsage ?? {});
  if (reported.length) return reported;
  const calendar = Object.entries(account?.calendarMonth?.monthlyServiceUsage ?? {});
  if (calendar.length) return calendar;
  return Object.entries(account?.currentServices ?? {}).flatMap(([key, rows]) =>
    rows.map((row) => [key, row] as const),
  );
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function amount(usage: ServiceUsage) {
  return Number(usage.amountAfterVolumeDiscountUsd ?? usage.baseAmountUsd ?? 0);
}

function dateKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function monthKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 7);
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function periodLabel(startAt?: string, endAt?: string) {
  if (!startAt || !endAt) return "Current Apify usage cycle";
  const format = (value: string) =>
    new Date(value).toLocaleDateString("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${format(startAt)} – ${format(endAt)}`;
}

function serviceLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function groupForService(key: string) {
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

export function calculateActorRows(payload: UsageCostsPayload): ActorRow[] {
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
  const currentCosts = new Map(
    (payload.accountUsage?.actors.current ?? []).map((item) => [item.actorId, item]),
  );
  const previousCosts = new Map(
    (payload.accountUsage?.actors.previous ?? []).map((item) => [item.actorId, item]),
  );
  const selectedActorIds = new Set(payload.filters?.actorIds ?? []);
  const scopedItems = selectedActorIds.size
    ? payload.items.filter((actor) => selectedActorIds.has(actor.id))
    : payload.items;
  const rows = scopedItems.map((actor) => {
    const currentDaily = actor.usageDaily.filter((item) => monthKey(item.date) === currentMonth);
    const previousDaily = actor.usageDaily.filter((item) => monthKey(item.date) === previousMonth);
    const live = currentCosts.get(actor.apifyActorId);
    const previous = previousCosts.get(actor.apifyActorId);
    return {
      id: actor.id,
      title: live?.title ?? actor.title ?? actor.actorName,
      username: live?.username ?? actor.username,
      actorName: live?.name ?? actor.actorName,
      cost:
        live?.totalUsageUsd ??
        currentDaily.reduce((total, item) => total + Number(item.usageCostUsd), 0),
      previousCost:
        previous?.totalUsageUsd ??
        (previousDaily.length
          ? previousDaily.reduce((total, item) => total + Number(item.usageCostUsd), 0)
          : null),
      runs: currentDaily.reduce((total, item) => total + item.runs, 0),
      previousRuns: previousDaily.reduce((total, item) => total + item.runs, 0),
      share: 0,
    };
  });
  const nonZeroRows = rows.filter(
    (row) =>
      row.cost > 0 || row.runs > 0 || Number(row.previousCost ?? 0) > 0 || row.previousRuns > 0,
  );
  const denominator = nonZeroRows.reduce((total, row) => total + row.cost, 0);
  return nonZeroRows
    .map((row) => ({ ...row, share: denominator > 0 ? (row.cost / denominator) * 100 : 0 }))
    .sort((left, right) => right.cost - left.cost || right.runs - left.runs);
}

export function calculateRevenueActorRows(payload: UsageCostsPayload): RevenueActorRow[] {
  const preserveSelectedActors = Boolean(payload.filters?.actorIds?.length);
  const rows = (payload.revenue?.actors ?? []).filter(
    (actor) =>
      preserveSelectedActors ||
      actor.costUsd !== 0 ||
      actor.revenueUsd !== 0 ||
      actor.profitUsd !== 0 ||
      actor.runs !== 0 ||
      actor.results !== 0,
  );
  const actorRevenueSubtotal = rows.reduce(
    (total, actor) => total + Number(actor.revenueUsd || 0),
    0,
  );

  return rows
    .map((actor) => ({
      ...actor,
      share:
        actorRevenueSubtotal > 0 ? (Number(actor.revenueUsd || 0) / actorRevenueSubtotal) * 100 : 0,
    }))
    .sort(
      (left, right) =>
        right.revenueUsd - left.revenueUsd ||
        right.profitUsd - left.profitUsd ||
        right.runs - left.runs,
    );
}

export function preferredHistoricalMonth(
  history: Array<{ month: string; cost: number }>,
): string | null {
  return (
    [...history].reverse().find((item) => item.cost > 0)?.month ?? history.at(-1)?.month ?? null
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-72 items-center justify-center rounded-sm border border-dashed px-6 text-center text-sm">
      {children}
    </div>
  );
}

type TrendMode = "absolute" | "cumulative";

function TrendModeToggle({
  mode,
  onChange,
  label,
}: {
  mode: TrendMode;
  onChange: (mode: TrendMode) => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 gap-1 rounded-sm border p-1" role="group" aria-label={label}>
      <Button
        size="sm"
        variant={mode === "absolute" ? "secondary" : "ghost"}
        onClick={() => onChange("absolute")}
      >
        Absolute
      </Button>
      <Button
        size="sm"
        variant={mode === "cumulative" ? "secondary" : "ghost"}
        onClick={() => onChange("cumulative")}
      >
        Cumulative
      </Button>
    </div>
  );
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
  icon: typeof DollarSign;
}) {
  return (
    <Card variant="stat">
      <CardContent className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
        </div>
        <span className="bg-signal-orange/10 text-signal-orange flex h-9 w-9 shrink-0 items-center justify-center rounded-sm">
          <Icon className="h-4 w-4" />
        </span>
      </CardContent>
    </Card>
  );
}

function ReportPagination({
  page,
  pageSize,
  total,
  label,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="border-border/80 mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-xs">
        Showing <span className="text-foreground font-medium">{start.toLocaleString("en-US")}</span>
        –<span className="text-foreground font-medium">{end.toLocaleString("en-US")}</span> of{" "}
        <span className="text-foreground font-medium">{total.toLocaleString("en-US")}</span>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <ItemsPerPageSelect
          value={pageSize}
          onChange={(nextPageSize) => {
            onPageSizeChange(nextPageSize);
            onPageChange(1);
          }}
          label={label}
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label={"Previous " + label.toLowerCase() + " page"}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-muted-foreground min-w-16 text-center text-xs tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            aria-label={"Next " + label.toLowerCase() + " page"}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

type FinancialMetric =
  "revenue" | "directCost" | "allocatedCost" | "profit" | "runs" | "results" | "users";
type RevenueSortKey =
  "revenue" | "directCost" | "allocatedCost" | "profit" | "margin" | "runs" | "results";

function utcDateOffset(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function percentageDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? null : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function MetricDelta({ current, previous }: { current: number; previous: number }) {
  const delta = percentageDelta(current, previous);
  if (delta == null) return <span>Previous period unavailable</span>;
  const Icon = delta >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={
        delta >= 0
          ? "text-signal-green inline-flex items-center gap-1"
          : "text-signal-orange inline-flex items-center gap-1"
      }
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(1)}% vs previous period
    </span>
  );
}

function CompactMetricDelta({ current, previous }: { current: number; previous: number }) {
  const delta = percentageDelta(current, previous);
  if (delta == null) return null;
  const Icon = delta >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={
        delta >= 0
          ? "text-signal-green mt-1 flex items-center justify-end gap-0.5 text-[10px]"
          : "text-signal-orange mt-1 flex items-center justify-end gap-0.5 text-[10px]"
      }
    >
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function ActorMultiSelect({
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
        <Button type="button" variant="outline" className="w-auto min-w-44 justify-between">
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
            <p className="text-muted-foreground text-[10px]">
              {selectedIds.length || actors.length} of {actors.length}
            </p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function downloadLedgerCsv(rows: NonNullable<UsageCostsPayload["revenue"]>["ledger"]) {
  const header = [
    "Date",
    "Actor",
    "Apify Actor ID",
    "Revenue USD",
    "Direct cost USD",
    "Allocated cost USD",
    "Net profit USD",
    "Margin %",
    "Runs",
    "Results",
    "Active users",
    "Cost source",
  ];
  const escape = (value: string | number | null) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    header,
    ...rows.map((row) => [
      row.date,
      row.title ?? row.actorName,
      row.apifyActorId,
      row.revenueUsd,
      row.directCostUsd,
      row.allocatedCostUsd,
      row.netProfitUsd,
      row.margin,
      row.runs,
      row.results,
      row.activeUsers,
      row.costSource,
    ]),
  ]
    .map((row) => row.map(escape).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "actor-financial-ledger.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function UsageCostsAnalytics({ payload }: { payload: UsageCostsPayload }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const activeView =
    requestedView === "history" || requestedView === "revenue" ? requestedView : "current";
  const selectedActorIds = payload.filters?.actorIds ?? [];
  const selectedFinancialMetric = (
    ["revenue", "directCost", "allocatedCost", "profit", "runs", "results", "users"].includes(
      searchParams.get("metric") ?? "",
    )
      ? searchParams.get("metric")
      : "revenue"
  ) as FinancialMetric;
  const comparePeriods = searchParams.get("compare") !== "false";
  const updateUrlFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const selectedFrom = payload.filters?.from ?? new Date().toISOString().slice(0, 10);
  const selectedTo = payload.filters?.to ?? new Date().toISOString().slice(0, 10);
  const selectedDays =
    Math.floor(
      (new Date(`${selectedTo}T00:00:00.000Z`).getTime() -
        new Date(`${selectedFrom}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1;
  const periodPreset = [7, 30, 90].includes(selectedDays) ? String(selectedDays) : "custom";
  const [selectedMonth, setSelectedMonth] = useState("");
  const [currentMode, setCurrentMode] = useState<TrendMode>("absolute");
  const [historyMode, setHistoryMode] = useState<TrendMode>("absolute");
  const [dailyHistoryMode, setDailyHistoryMode] = useState<TrendMode>("absolute");
  const revenueMode = payload.filters?.mode ?? "absolute";
  const revenueGranularity = payload.filters?.granularity ?? "day";
  const [query, setQuery] = useState("");
  const [actorPage, setActorPage] = useState(1);
  const [actorPageSize, setActorPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [revenueQuery, setRevenueQuery] = useState("");
  const [revenuePage, setRevenuePage] = useState(1);
  const [revenuePageSize, setRevenuePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [revenueSort, setRevenueSort] = useState<RevenueSortKey>("revenue");
  const [revenueSortDirection, setRevenueSortDirection] = useState<"asc" | "desc">("desc");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(DEFAULT_PAGE_SIZE);
  const account = payload.accountUsage;
  const credentialIssue = account?.credentialIssue ?? null;
  const usage = account?.currentPeriod?.usage ?? null;
  const limits = account?.currentPeriod?.limits ?? null;

  const localDailyRuns = useMemo(() => {
    const map = new Map<string, number>();
    const selected = new Set(payload.filters?.actorIds ?? []);
    for (const actor of payload.items) {
      if (selected.size && !selected.has(actor.id)) continue;
      for (const item of actor.usageDaily) {
        const key = dateKey(item.date);
        map.set(key, (map.get(key) ?? 0) + item.runs);
      }
    }
    return map;
  }, [payload.filters?.actorIds, payload.items]);

  const currentServiceEntries = resolveCurrentServiceEntries(account);
  const services = currentServiceEntries
    .map(([key, value]) => ({ key, cost: amount(value), quantity: Number(value.quantity || 0) }))
    .filter((item) => item.cost > 0 || item.quantity > 0)
    .sort((left, right) => right.cost - left.cost);
  const serviceGroups = Array.from(
    services.reduce((groups, service) => {
      const name = groupForService(service.key);
      groups.set(name, (groups.get(name) ?? 0) + service.cost);
      return groups;
    }, new Map<string, number>()),
  )
    .map(([name, cost]) => ({ name, cost }))
    .sort((left, right) => right.cost - left.cost);

  const reportedCurrentTotal = Number(
    usage?.totalUsageCreditsUsdAfterVolumeDiscount ?? limits?.current.monthlyUsageUsd ?? 0,
  );
  const currentServiceTotal = services.reduce((total, service) => total + service.cost, 0);
  // Apify can return an empty current-cycle summary while the same refresh
  // already contains populated current calendar-month usage. Prefer the live
  // total when it is meaningful, otherwise use that synchronized service sum.
  const currentTotal = reportedCurrentTotal > 0 ? reportedCurrentTotal : currentServiceTotal;
  const reportedBeforeDiscount = Number(usage?.totalUsageCreditsUsdBeforeVolumeDiscount ?? 0);
  const beforeDiscount = reportedBeforeDiscount > 0 ? reportedBeforeDiscount : currentTotal;
  const allowance = Number(limits?.limits.maxMonthlyUsageUsd ?? 0);
  const remaining = allowance > 0 ? Math.max(0, allowance - currentTotal) : null;
  const cycle = usage?.usageCycle ?? limits?.monthlyUsageCycle;
  const cycleStart = cycle?.startAt ? new Date(cycle.startAt) : null;
  const cycleEnd = cycle?.endAt ? new Date(cycle.endAt) : null;
  const cycleFromKey = cycleStart ? cycleStart.toISOString().slice(0, 10) : null;
  const cycleToKey = cycleEnd
    ? new Date(Math.min(Date.now(), cycleEnd.getTime() - 86_400_000)).toISOString().slice(0, 10)
    : null;
  const resolvedPeriodPreset =
    cycleFromKey === selectedFrom && cycleToKey === selectedTo ? "cycle" : periodPreset;
  const elapsedDays = cycleStart
    ? Math.max(1, Math.ceil((Date.now() - cycleStart.getTime()) / 86_400_000))
    : 1;
  const cycleDays =
    cycleStart && cycleEnd
      ? Math.max(1, Math.ceil((cycleEnd.getTime() - cycleStart.getTime()) / 86_400_000))
      : elapsedDays;
  const forecast = (currentTotal / elapsedDays) * cycleDays;

  const currentPeriodMonth = new Date().toISOString().slice(0, 7);
  const isCurrentPeriodDate = (value: string) => {
    const timestamp = new Date(value).getTime();
    if (cycleStart && cycleEnd && Number.isFinite(timestamp)) {
      return timestamp >= cycleStart.getTime() && timestamp < cycleEnd.getTime();
    }
    return dateKey(value).startsWith(currentPeriodMonth);
  };
  const currentDaily = usage?.dailyServiceUsages?.length
    ? usage.dailyServiceUsages.map((item) => ({
        date: dateKey(item.date),
        label: dateLabel(item.date),
        cost: Number(item.totalUsageCreditsUsd || 0),
        runs: localDailyRuns.get(dateKey(item.date)) ?? 0,
      }))
    : Object.entries(account?.calendarMonth?.dailyServiceUsage ?? {})
        .filter(([date]) => isCurrentPeriodDate(date))
        .map(([date, rows]) => ({
          date: dateKey(date),
          label: dateLabel(date),
          cost: rows.reduce((total, item) => total + amount(item), 0),
          runs: localDailyRuns.get(dateKey(date)) ?? 0,
        }))
        .sort((left, right) => left.date.localeCompare(right.date));
  const peakDay = currentDaily.reduce((peak, item) => (item.cost > peak.cost ? item : peak), {
    date: "",
    label: "No usage",
    cost: 0,
    runs: 0,
  });
  let cumulativeCurrentCost = 0;
  let cumulativeCurrentRuns = 0;
  const currentDailyChart = currentDaily.map((item) => {
    cumulativeCurrentCost += item.cost;
    cumulativeCurrentRuns += item.runs;
    return {
      ...item,
      displayCost: currentMode === "cumulative" ? cumulativeCurrentCost : item.cost,
      displayRuns: currentMode === "cumulative" ? cumulativeCurrentRuns : item.runs,
    };
  });

  const dailyUsageHistory = Object.entries(account?.calendarMonth?.dailyServiceUsage ?? {})
    .map(([date, rows]) => ({
      date: dateKey(date),
      label: dateLabel(date),
      cost: rows.reduce((total, item) => total + amount(item), 0),
      runs: localDailyRuns.get(dateKey(date)) ?? 0,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
  let cumulativeHistoricalDailyCost = 0;
  let cumulativeHistoricalDailyRuns = 0;
  const dailyUsageHistoryChart = dailyUsageHistory.map((item) => {
    cumulativeHistoricalDailyCost += item.cost;
    cumulativeHistoricalDailyRuns += item.runs;
    return {
      ...item,
      displayCost: dailyHistoryMode === "cumulative" ? cumulativeHistoricalDailyCost : item.cost,
      displayRuns: dailyHistoryMode === "cumulative" ? cumulativeHistoricalDailyRuns : item.runs,
    };
  });

  const monthlyHistory = Object.entries(account?.monthly ?? {})
    .map(([month, item]) => ({
      month,
      label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      cost: Object.values(item.serviceUsages ?? {}).reduce(
        (total, service) => total + Number(service.baseAmountUsd || 0),
        0,
      ),
    }))
    .sort((left, right) => left.month.localeCompare(right.month));
  let cumulativeCost = 0;
  const historicalChart = monthlyHistory.map((item) => {
    cumulativeCost += item.cost;
    return { ...item, displayCost: historyMode === "cumulative" ? cumulativeCost : item.cost };
  });
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentCalendarServices = account?.calendarMonth?.monthlyServiceUsage ?? {};
  const monthOptions = Array.from(
    new Set([
      ...(Object.keys(currentCalendarServices).length ? [currentMonth] : []),
      ...monthlyHistory.map((item) => item.month).reverse(),
    ]),
  );
  const defaultMonth = preferredHistoricalMonth(monthlyHistory) ?? monthOptions[0] ?? currentMonth;
  const effectiveMonth = monthOptions.includes(selectedMonth) ? selectedMonth : defaultMonth;
  const selectedUsage = account?.monthly?.[effectiveMonth];
  const selectedServiceSource =
    effectiveMonth === currentMonth && Object.keys(currentCalendarServices).length
      ? currentCalendarServices
      : (selectedUsage?.serviceUsages ?? {});
  const selectedServices = Object.entries(selectedServiceSource)
    .map(([key, value]) => ({ key, quantity: Number(value.quantity || 0), cost: amount(value) }))
    .filter((item) => item.quantity > 0 || item.cost > 0)
    .sort((left, right) => right.cost - left.cost);
  const selectedMonthCost = selectedServices.reduce((total, item) => total + item.cost, 0);

  const previousMonth = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1),
  )
    .toISOString()
    .slice(0, 7);
  const actorRows = calculateActorRows(payload);
  const actorRowsForMonth =
    effectiveMonth === previousMonth
      ? actorRows
          .map((row) => ({
            ...row,
            cost: Number(row.previousCost ?? 0),
            runs: row.previousRuns,
            share: 0,
          }))
          .filter((row) => row.cost > 0 || row.runs > 0)
      : actorRows;
  const actorMonthSubtotal = actorRowsForMonth.reduce((total, row) => total + row.cost, 0);
  const actorRowsWithShares = actorRowsForMonth
    .map((row) => ({
      ...row,
      share: actorMonthSubtotal > 0 ? (row.cost / actorMonthSubtotal) * 100 : 0,
    }))
    .sort((left, right) => right.cost - left.cost || right.runs - left.runs);
  const filteredActorRows = actorRowsWithShares.filter((row) => {
    const haystack = `${row.title} ${row.username} ${row.actorName}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const actorTotalPages = Math.max(1, Math.ceil(filteredActorRows.length / actorPageSize));
  const currentActorPage = Math.min(actorPage, actorTotalPages);
  const visibleActorRows = filteredActorRows.slice(
    (currentActorPage - 1) * actorPageSize,
    currentActorPage * actorPageSize,
  );
  const selectedActorPeriod = effectiveMonth === currentMonth || effectiveMonth === previousMonth;

  const previousCalendarCost = monthlyHistory.find((item) => item.month === previousMonth)?.cost;
  const currentCalendarCost = Object.keys(currentCalendarServices).length
    ? Object.values(currentCalendarServices).reduce((total, item) => total + amount(item), 0)
    : monthlyHistory.find((item) => item.month === currentMonth)?.cost;
  const monthlyDelta =
    previousCalendarCost && currentCalendarCost != null
      ? ((currentCalendarCost - previousCalendarCost) / previousCalendarCost) * 100
      : null;

  const revenue = payload.revenue ?? null;
  const revenueActors = calculateRevenueActorRows(payload);
  const sortValue = (actor: RevenueActorRow, key: RevenueSortKey) => {
    switch (key) {
      case "directCost":
        return actor.costUsd;
      case "allocatedCost":
        return actor.allocatedCostUsd;
      case "profit":
        return actor.netProfitUsd;
      case "margin":
        return actor.margin ?? Number.NEGATIVE_INFINITY;
      case "runs":
        return actor.runs;
      case "results":
        return actor.results;
      case "revenue":
        return actor.revenueUsd;
    }
  };
  const filteredRevenueActors = revenueActors
    .filter((actor) => {
      const haystack = `${actor.title ?? ""} ${actor.username} ${actor.actorName}`.toLowerCase();
      return haystack.includes(revenueQuery.trim().toLowerCase());
    })
    .sort((left, right) => {
      const delta = sortValue(left, revenueSort) - sortValue(right, revenueSort);
      return revenueSortDirection === "asc" ? delta : -delta;
    });
  const revenueTotalPages = Math.max(1, Math.ceil(filteredRevenueActors.length / revenuePageSize));
  const currentRevenuePage = Math.min(revenuePage, revenueTotalPages);
  const visibleRevenueActors = filteredRevenueActors.slice(
    (currentRevenuePage - 1) * revenuePageSize,
    currentRevenuePage * revenuePageSize,
  );
  const revenueTotals = revenueActors.reduce(
    (totals, actor) => ({
      cost: totals.cost + Number(actor.costUsd || 0),
      allocatedCost: totals.allocatedCost + Number(actor.allocatedCostUsd || 0),
      revenue: totals.revenue + Number(actor.revenueUsd || 0),
      profit: totals.profit + Number(actor.netProfitUsd || 0),
      runs: totals.runs + Number(actor.runs || 0),
      results: totals.results + Number(actor.results || 0),
      activeUsers: totals.activeUsers + Number(actor.activeUsers || 0),
      allocatedCostAvailable: totals.allocatedCostAvailable && actor.allocatedCostAvailable,
    }),
    {
      cost: 0,
      allocatedCost: 0,
      revenue: 0,
      profit: 0,
      runs: 0,
      results: 0,
      activeUsers: 0,
      allocatedCostAvailable: revenueActors.length > 0,
    },
  );
  const revenueMargin =
    revenueTotals.allocatedCostAvailable && revenueTotals.revenue > 0
      ? (revenueTotals.profit / revenueTotals.revenue) * 100
      : null;
  const revenueMonthly = [...(revenue?.monthly ?? [])]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((item) => ({
      ...item,
      label: new Date(`${item.month}-01T00:00:00Z`).toLocaleDateString("en", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
    }));
  const revenueDaily = [...(revenue?.daily ?? [])]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((item) => ({ ...item, label: dateLabel(item.date) }));
  const revenueTrendSource = revenueGranularity === "day" ? revenueDaily : revenueMonthly;
  let cumulativeRevenue = 0;
  let cumulativeRevenueCost = 0;
  let cumulativeAllocatedCost = 0;
  let cumulativeProfit = 0;
  let cumulativeRuns = 0;
  let cumulativeResults = 0;
  let cumulativeUsers = 0;
  const revenueTrend = revenueTrendSource.map((item) => {
    cumulativeRevenue += item.revenueUsd;
    cumulativeRevenueCost += item.costUsd;
    cumulativeAllocatedCost += item.allocatedCostUsd;
    cumulativeProfit += item.netProfitUsd;
    cumulativeRuns += item.runs;
    cumulativeResults += item.results;
    cumulativeUsers += item.activeUsers;
    return {
      ...item,
      displayRevenueUsd: revenueMode === "cumulative" ? cumulativeRevenue : item.revenueUsd,
      displayCostUsd: revenueMode === "cumulative" ? cumulativeRevenueCost : item.costUsd,
      displayAllocatedCostUsd:
        revenueMode === "cumulative" ? cumulativeAllocatedCost : item.allocatedCostUsd,
      displayProfitUsd: revenueMode === "cumulative" ? cumulativeProfit : item.netProfitUsd,
      displayRuns: revenueMode === "cumulative" ? cumulativeRuns : item.runs,
      displayResults: revenueMode === "cumulative" ? cumulativeResults : item.results,
      displayUsers: revenueMode === "cumulative" ? cumulativeUsers : item.activeUsers,
    };
  });
  const financialMetricConfig: Record<
    FinancialMetric,
    { dataKey: string; label: string; color: string; currency: boolean }
  > = {
    revenue: {
      dataKey: "displayRevenueUsd",
      label: "Revenue",
      color: "var(--color-signal-green)",
      currency: true,
    },
    directCost: {
      dataKey: "displayCostUsd",
      label: "Direct Actor cost",
      color: "var(--color-signal-orange)",
      currency: true,
    },
    allocatedCost: {
      dataKey: "displayAllocatedCostUsd",
      label: "Allocated platform cost",
      color: "var(--color-signal-orange)",
      currency: true,
    },
    profit: {
      dataKey: "displayProfitUsd",
      label: "Net profit",
      color: "var(--color-signal-blue)",
      currency: true,
    },
    runs: {
      dataKey: "displayRuns",
      label: "Runs",
      color: "var(--color-signal-blue)",
      currency: false,
    },
    results: {
      dataKey: "displayResults",
      label: "Results",
      color: "var(--color-signal-blue)",
      currency: false,
    },
    users: {
      dataKey: "displayUsers",
      label: "Active users",
      color: "var(--color-signal-green)",
      currency: false,
    },
  };
  const selectedMetric = financialMetricConfig[selectedFinancialMetric];
  const ledgerRows = [...(revenue?.ledger ?? [])].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.actorName.localeCompare(right.actorName),
  );
  const ledgerTotal = revenue?.ledgerTotal ?? ledgerRows.length;
  const ledgerTruncated = Boolean(revenue?.ledgerTruncated);
  const ledgerTotalPages = Math.max(1, Math.ceil(ledgerRows.length / ledgerPageSize));
  const currentLedgerPage = Math.min(ledgerPage, ledgerTotalPages);
  const visibleLedgerRows = ledgerRows.slice(
    (currentLedgerPage - 1) * ledgerPageSize,
    currentLedgerPage * ledgerPageSize,
  );
  const comparisonActors = payload.items.filter((actor) => selectedActorIds.includes(actor.id));
  const ledgerMetricValue = (row: (typeof ledgerRows)[number]) => {
    switch (selectedFinancialMetric) {
      case "directCost":
        return row.directCostUsd ?? 0;
      case "allocatedCost":
        return row.allocatedCostUsd ?? 0;
      case "profit":
        return row.netProfitUsd ?? 0;
      case "runs":
        return row.runs;
      case "results":
        return row.results;
      case "users":
        return row.activeUsers ?? 0;
      case "revenue":
        return row.revenueUsd ?? 0;
    }
  };
  const comparisonPeriods = new Map<string, Record<string, number | string>>();
  for (const row of ledgerRows) {
    const period = revenueGranularity === "day" ? row.date : row.date.slice(0, 7);
    const point = comparisonPeriods.get(period) ?? {
      period,
      label:
        revenueGranularity === "day"
          ? dateLabel(period)
          : new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en", {
              month: "short",
              year: "2-digit",
              timeZone: "UTC",
            }),
    };
    point[row.actorId] = Number(point[row.actorId] ?? 0) + ledgerMetricValue(row);
    comparisonPeriods.set(period, point);
  }
  const comparisonCumulative = new Map<string, number>();
  const actorComparisonTrend = [...comparisonPeriods.values()]
    .sort((left, right) => String(left.period).localeCompare(String(right.period)))
    .map((point) => {
      if (revenueMode !== "cumulative") return point;
      const cumulativePoint = { ...point };
      for (const actor of comparisonActors) {
        const total = (comparisonCumulative.get(actor.id) ?? 0) + Number(point[actor.id] ?? 0);
        comparisonCumulative.set(actor.id, total);
        cumulativePoint[actor.id] = total;
      }
      return cumulativePoint;
    });
  const currentUsageSeries = [
    {
      key: "displayCost",
      label: currentMode === "cumulative" ? "Cumulative usage" : "Usage",
      color: "var(--color-signal-orange)",
      format: { unit: "currency" as const, currency: "USD" },
    },
    {
      key: "displayRuns",
      label: currentMode === "cumulative" ? "Cumulative runs" : "Runs",
      color: "var(--color-signal-blue)",
      format: { unit: "compact" as const },
    },
  ] as const;
  const historicalUsageSeries = [
    {
      key: "displayCost",
      label: historyMode === "cumulative" ? "Cumulative usage" : "Usage",
      color: "var(--color-signal-orange)",
      format: { unit: "currency" as const, currency: "USD" },
    },
  ] as const;
  const historicalDailyUsageSeries = [
    ...currentUsageSeries.map((item) => ({
      ...item,
      label:
        item.key === "displayCost"
          ? dailyHistoryMode === "cumulative"
            ? "Cumulative usage"
            : "Usage"
          : dailyHistoryMode === "cumulative"
            ? "Cumulative runs"
            : "Runs",
    })),
  ] as const;
  const revenueSeries = [
    {
      key: selectedMetric.dataKey,
      label: `${revenueMode === "cumulative" ? "Cumulative " : ""}${selectedMetric.label}`,
      color: selectedMetric.color,
      format: selectedMetric.currency
        ? { unit: "currency" as const, currency: "USD" }
        : { unit: "compact" as const },
    },
  ] as const;
  const comparisonColors = [
    "var(--color-signal-green)",
    "var(--color-signal-blue)",
    "var(--color-signal-orange)",
    "var(--color-foreground)",
    "var(--color-muted-foreground)",
  ];
  const comparisonSeries = comparisonActors.map((actor, index) => ({
    key: actor.id,
    label: actor.title ?? actor.actorName,
    color: comparisonColors[index] ?? comparisonColors[comparisonColors.length - 1]!,
    format: selectedMetric.currency
      ? { unit: "currency" as const, currency: "USD" }
      : { unit: "compact" as const },
  }));
  const hasRevenueData = Boolean(
    revenue &&
    (revenueMonthly.some(
      (item) =>
        item.revenueUsd !== 0 ||
        item.costUsd !== 0 ||
        item.profitUsd !== 0 ||
        item.runs !== 0 ||
        item.results !== 0,
    ) ||
      revenueActors.length),
  );
  const activeFinancialFilterCount =
    Number(selectedActorIds.length > 0) +
    Number(resolvedPeriodPreset !== "30") +
    Number(selectedFinancialMetric !== "revenue") +
    Number(!comparePeriods);
  const renderFinancialFilters = () => (
    <>
      <ActorMultiSelect
        actors={payload.items}
        selectedIds={selectedActorIds}
        onChange={(ids) => updateUrlFilters({ actors: ids.length ? ids.join(",") : null })}
      />
      <Select
        value={resolvedPeriodPreset}
        onValueChange={(value) => {
          if (value === "custom") return;
          if (value === "cycle" && cycleFromKey && cycleToKey) {
            updateUrlFilters({ from: cycleFromKey, to: cycleToKey });
            return;
          }
          const days = Number(value);
          updateUrlFilters({ from: utcDateOffset(-(days - 1)), to: utcDateOffset(0) });
        }}
      >
        <SelectTrigger className="w-auto min-w-40" aria-label="Financial period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {cycleFromKey && cycleToKey ? <SelectItem value="cycle">Billing cycle</SelectItem> : null}
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {resolvedPeriodPreset === "custom" ? (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedFrom}
            max={selectedTo}
            onChange={(event) => updateUrlFilters({ from: event.target.value })}
            aria-label="Start date"
            className="w-36 min-w-36"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            value={selectedTo}
            min={selectedFrom}
            max={utcDateOffset(0)}
            onChange={(event) => updateUrlFilters({ to: event.target.value })}
            aria-label="End date"
            className="w-36 min-w-36"
          />
        </div>
      ) : null}
      <Select
        value={selectedFinancialMetric}
        onValueChange={(value) => updateUrlFilters({ metric: value === "revenue" ? null : value })}
      >
        <SelectTrigger className="w-auto min-w-44" aria-label="Chart metric">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="revenue">Revenue</SelectItem>
          <SelectItem value="directCost">Direct Actor cost</SelectItem>
          <SelectItem value="allocatedCost">Allocated platform cost</SelectItem>
          <SelectItem value="profit">Net profit</SelectItem>
          <SelectItem value="runs">Runs</SelectItem>
          <SelectItem value="results">Results</SelectItem>
          <SelectItem value="users">Active users</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant={comparePeriods ? "secondary" : "outline"}
        size="sm"
        onClick={() => updateUrlFilters({ compare: comparePeriods ? "false" : null })}
      >
        <ArrowDownUp className="h-4 w-4" />
        Compare
      </Button>
      {activeFinancialFilterCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            updateUrlFilters({
              actors: null,
              from: utcDateOffset(-29),
              to: utcDateOffset(0),
              metric: null,
              compare: null,
            })
          }
        >
          <X className="h-4 w-4" />
          Reset
        </Button>
      ) : null}
    </>
  );
  const revenueSortHeader = (key: RevenueSortKey, label: string) => (
    <button
      type="button"
      className="hover:text-foreground inline-flex items-center justify-end gap-1.5"
      onClick={() => {
        if (revenueSort === key) {
          setRevenueSortDirection((direction) => (direction === "desc" ? "asc" : "desc"));
        } else {
          setRevenueSort(key);
          setRevenueSortDirection("desc");
        }
        setRevenuePage(1);
      }}
    >
      {label}
      <ArrowDownUp
        className={`h-3 w-3 ${revenueSort === key ? "text-signal-blue" : "text-muted-foreground/60"}`}
      />
    </button>
  );

  return (
    <DashboardUrlTabs value={activeView} param="view" className="space-y-5">
      <Card className="dashboard-filter-rail border-signal-blue/20 bg-card/95">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Analytics scope</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {selectedActorIds.length
                ? `${selectedActorIds.length} selected Actors`
                : "All workspace Actors"}
              {` · ${selectedFrom} to ${selectedTo} · UTC`}
            </p>
          </div>
          <ResponsiveFilterBar
            renderFilters={renderFinancialFilters}
            activeCount={activeFinancialFilterCount}
            mobileLabel="Analytics filters"
            className="flex-wrap justify-end"
          />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList aria-label="Usage analytics period">
          <TabsTrigger value="current">Current period</TabsTrigger>
          <TabsTrigger value="history">Historical usage</TabsTrigger>
          <TabsTrigger value="revenue">Revenue &amp; profit</TabsTrigger>
        </TabsList>
        {account?.unavailable ? (
          <p className="text-muted-foreground text-xs">
            {account.unavailable} optional Apify dataset
            {account.unavailable === 1 ? " is" : "s are"} unavailable.
          </p>
        ) : null}
      </div>

      {credentialIssue ? (
        <Card className="border-signal-orange/50 bg-signal-orange/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 gap-3">
              <ShieldAlert className="text-signal-orange mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Apify account connection needs attention</p>
                <p className="text-muted-foreground mt-1 max-w-4xl text-xs leading-5">
                  {credentialIssue.message} Current-period usage still comes from the API key, but
                  historical, per-Actor, and revenue analytics are paused to prevent mixing account
                  data.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <a href="/dashboard/apify">Update Console credential</a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <TabsContent value="current" className="space-y-5">
        {selectedActorIds.length ? (
          <div className="border-signal-blue/25 bg-signal-blue/5 text-muted-foreground rounded-sm border px-4 py-3 text-xs leading-5">
            Actor activity follows the selected scope. Apify billing-cycle and service totals remain
            workspace-wide because those account charges are not reported per Actor.
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Platform usage"
            value={money.format(currentTotal)}
            detail={periodLabel(cycle?.startAt, cycle?.endAt)}
            icon={DollarSign}
          />
          <MetricCard
            label="Remaining allowance"
            value={remaining == null ? "Not limited" : money.format(remaining)}
            detail={
              allowance > 0
                ? `${money.format(allowance)} usage limit`
                : "No monthly USD limit returned"
            }
            icon={Gauge}
          />
          <MetricCard
            label="Projected cycle cost"
            value={money.format(Number.isFinite(forecast) ? forecast : currentTotal)}
            detail={`${money.format(currentTotal / elapsedDays)} average per day`}
            icon={ArrowUpRight}
          />
          <MetricCard
            label="Peak usage day"
            value={money.format(peakDay.cost)}
            detail={peakDay.label}
            icon={CalendarDays}
          />
        </div>

        {allowance > 0 ? (
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Plan consumption</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Discounted usage against the limit returned by Apify.
                  </p>
                </div>
                <p className="font-mono text-sm tabular-nums">
                  {Math.min(100, (currentTotal / allowance) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-muted mt-4 h-2 overflow-hidden rounded-full">
                <div
                  className="bg-signal-orange h-full rounded-full"
                  style={{ width: `${Math.min(100, (currentTotal / allowance) * 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          <Card className="min-w-0">
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
              <div>
                <CardTitle>
                  {currentMode === "cumulative"
                    ? "Cumulative usage in the current period"
                    : "Daily usage in the current period"}
                </CardTitle>
                <p className="text-muted-foreground mt-1 text-xs">
                  Apify platform usage and locally synchronized Actor runs on their actual dates.
                </p>
              </div>
              <TrendModeToggle
                mode={currentMode}
                onChange={setCurrentMode}
                label="Current-period usage display"
              />
            </CardHeader>
            <CardContent>
              <ChartFrame
                ariaLabel="Current-period usage and runs"
                series={currentUsageSeries}
                status={currentDailyChart.length ? "ready" : "empty"}
                statusMessage="Synchronize usage to import the daily current-period series."
                options={{ compact: true }}
                chartClassName="h-80 min-w-0"
              >
                {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={currentDailyChart}
                      margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="var(--color-border)"
                        strokeOpacity={0.55}
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
                        yAxisId="cost"
                        hide={!axisLabelsVisible}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickFormatter={(value) => money.format(Number(value))}
                        tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                      />
                      <YAxis
                        yAxisId="runs"
                        orientation="right"
                        hide
                        axisLine={false}
                        tickLine={false}
                        width={42}
                        tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                      />
                      <Tooltip content={<ChartTooltip series={currentUsageSeries} />} />
                      <Line
                        yAxisId="cost"
                        type="monotone"
                        dataKey="displayCost"
                        name={currentUsageSeries[0].label}
                        hide={!visibleSeries.has("displayCost")}
                        stroke="var(--color-signal-orange)"
                        strokeWidth={2.5}
                        dot={false}
                        label={dataLabelsVisible}
                        isAnimationActive={false}
                      />
                      <Line
                        yAxisId="runs"
                        type="monotone"
                        dataKey="displayRuns"
                        name={currentUsageSeries[1].label}
                        hide={!visibleSeries.has("displayRuns")}
                        stroke="var(--color-signal-blue)"
                        strokeWidth={1.75}
                        dot={false}
                        label={dataLabelsVisible}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartFrame>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current service usage</CardTitle>
              <p className="text-muted-foreground text-xs">
                Service groups first, followed by the highest-cost resources.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {serviceGroups.length ? (
                <div className="grid grid-cols-2 gap-3">
                  {serviceGroups.map((group) => (
                    <div key={group.name} className="bg-muted/45 rounded-sm border p-3">
                      <p className="text-muted-foreground text-xs">{group.name}</p>
                      <p className="mt-1 font-mono text-sm font-semibold">
                        {money.format(group.cost)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              {services.length ? (
                <div className="divide-border divide-y">
                  {services.slice(0, 8).map((service) => (
                    <div
                      key={service.key}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{serviceLabel(service.key)}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {service.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                          units
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-sm font-semibold">
                        {money.format(service.cost)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyChart>No current service usage was returned by Apify.</EmptyChart>
              )}
              {beforeDiscount > currentTotal ? (
                <p className="text-muted-foreground text-xs">
                  Volume discount saved {money.format(beforeDiscount - currentTotal)} this cycle.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="history" className="space-y-5">
        {selectedActorIds.length ? (
          <div className="border-signal-blue/25 bg-signal-blue/5 text-muted-foreground rounded-sm border px-4 py-3 text-xs leading-5">
            The Actor breakdown follows the selected scope. Monthly service totals remain
            workspace-wide for accurate reconciliation with Apify billing.
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Selected month"
            value={money.format(selectedMonthCost)}
            detail={new Date(`${effectiveMonth}-01T00:00:00Z`).toLocaleDateString("en", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
            icon={DollarSign}
          />
          <MetricCard
            label="12-month raw usage"
            value={money.format(monthlyHistory.reduce((total, item) => total + item.cost, 0))}
            detail="Before account-level billing adjustments"
            icon={Activity}
          />
          <MetricCard
            label="Active services"
            value={selectedServices.length.toLocaleString("en-US")}
            detail="Services with quantity or cost"
            icon={Gauge}
          />
          <MetricCard
            label="Vs previous month"
            value={
              monthlyDelta == null
                ? "—"
                : `${monthlyDelta >= 0 ? "+" : ""}${monthlyDelta.toFixed(1)}%`
            }
            detail="Raw calendar-month comparison"
            icon={monthlyDelta != null && monthlyDelta < 0 ? ArrowDownRight : ArrowUpRight}
          />
        </div>

        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle>Historical platform usage</CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                Calendar-month raw usage; discounts and credits can make invoice totals differ.
              </p>
            </div>
            <TrendModeToggle
              mode={historyMode}
              onChange={setHistoryMode}
              label="Historical monthly usage display"
            />
          </CardHeader>
          <CardContent>
            <ChartFrame
              ariaLabel="Historical monthly platform usage"
              series={historicalUsageSeries}
              status={historicalChart.length ? "ready" : "empty"}
              statusMessage={
                credentialIssue
                  ? "Historical usage is paused until the Console credential matches the API-key account."
                  : "No historical account usage is available yet."
              }
              options={{ showSeriesControls: false, compact: true }}
              chartClassName="h-80 min-w-0"
            >
              {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={historicalChart}
                    margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="historicalUsageFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--color-signal-orange)"
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-signal-orange)"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--color-border)"
                      strokeOpacity={0.55}
                    />
                    <XAxis
                      dataKey="label"
                      hide={!axisLabelsVisible}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <YAxis
                      hide={!axisLabelsVisible}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(value) => money.format(Number(value))}
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <Tooltip content={<ChartTooltip series={historicalUsageSeries} />} />
                    <Area
                      type="monotone"
                      dataKey="displayCost"
                      name={historicalUsageSeries[0].label}
                      hide={!visibleSeries.has("displayCost")}
                      stroke="var(--color-signal-orange)"
                      fill="url(#historicalUsageFill)"
                      strokeWidth={2.5}
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
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle>
                {dailyHistoryMode === "cumulative"
                  ? "Cumulative platform usage by day"
                  : "Platform usage by day"}
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-xs">
                Daily calendar-month usage from Apify. A fresh sync retains up to twelve months of
                day-level history.
              </p>
            </div>
            <TrendModeToggle
              mode={dailyHistoryMode}
              onChange={setDailyHistoryMode}
              label="Historical daily usage display"
            />
          </CardHeader>
          <CardContent>
            <ChartFrame
              ariaLabel="Historical daily platform usage and runs"
              series={historicalDailyUsageSeries}
              status={dailyUsageHistoryChart.length ? "ready" : "empty"}
              statusMessage="Synchronize usage to import the day-level historical platform usage series."
              options={{ compact: true }}
              chartClassName="h-80 min-w-0"
            >
              {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dailyUsageHistoryChart}
                    margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--color-border)"
                      strokeOpacity={0.55}
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
                      yAxisId="cost"
                      hide={!axisLabelsVisible}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(value) => money.format(Number(value))}
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <YAxis
                      yAxisId="runs"
                      orientation="right"
                      hide
                      axisLine={false}
                      tickLine={false}
                      width={42}
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <Tooltip content={<ChartTooltip series={historicalDailyUsageSeries} />} />
                    <Line
                      yAxisId="cost"
                      type="monotone"
                      dataKey="displayCost"
                      name={historicalDailyUsageSeries[0].label}
                      hide={!visibleSeries.has("displayCost")}
                      stroke="var(--color-signal-orange)"
                      strokeWidth={2.5}
                      dot={false}
                      label={dataLabelsVisible}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="runs"
                      type="monotone"
                      dataKey="displayRuns"
                      name={historicalDailyUsageSeries[1].label}
                      hide={!visibleSeries.has("displayRuns")}
                      stroke="var(--color-signal-blue)"
                      strokeWidth={1.75}
                      dot={false}
                      label={dataLabelsVisible}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartFrame>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
              <div>
                <CardTitle>Usage by Actor</CardTitle>
                <p className="text-muted-foreground mt-1 text-xs">
                  Only Actors with usage or runs are shown. Shares use the Actor subtotal, never the
                  account total.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActorPage(1);
                  }}
                  placeholder="Search Actors"
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              {selectedActorPeriod && filteredActorRows.length ? (
                <div className="divide-border divide-y">
                  {visibleActorRows.map((row) => (
                    <div key={row.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{row.title}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {row.username}/{row.actorName}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-left lg:shrink-0 lg:text-right">
                          <div>
                            <p className="text-muted-foreground text-[11px]">Runs</p>
                            <p className="font-mono text-sm">{row.runs.toLocaleString("en-US")}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[11px]">Cost</p>
                            <p className="font-mono text-sm">{money.format(row.cost)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[11px]">Share</p>
                            <p className="font-mono text-sm">{row.share.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                        <div
                          className="bg-signal-orange h-full rounded-full"
                          style={{ width: `${Math.min(100, row.share)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <ReportPagination
                    page={currentActorPage}
                    pageSize={actorPageSize}
                    total={filteredActorRows.length}
                    label="Actors per page"
                    onPageChange={setActorPage}
                    onPageSizeChange={setActorPageSize}
                  />
                </div>
              ) : (
                <EmptyChart>
                  {credentialIssue
                    ? "Per-Actor usage is unavailable until the Console credential matches the API-key account."
                    : selectedActorPeriod
                      ? "No Actor usage matches this search."
                      : "Per-Actor breakdown is available for the current and previous calendar months."}
                </EmptyChart>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Month service detail</CardTitle>
              {monthOptions.length ? (
                <Select value={effectiveMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="mt-3 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((month) => (
                      <SelectItem key={month} value={month}>
                        {new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", {
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </CardHeader>
            <CardContent>
              {selectedServices.length ? (
                <div className="divide-border divide-y">
                  {selectedServices.slice(0, 12).map((service) => (
                    <div
                      key={service.key}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{serviceLabel(service.key)}</p>
                        <p className="text-muted-foreground text-xs">
                          {service.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                          units
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-sm font-semibold">
                        {money.format(service.cost)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyChart>
                  {credentialIssue
                    ? "Monthly service detail is unavailable until the Console credential is corrected."
                    : "No service usage was returned for this month."}
                </EmptyChart>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="revenue" className="space-y-5">
        {!hasRevenueData ? (
          <Card>
            <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
              <span className="bg-signal-orange/10 text-signal-orange flex h-12 w-12 items-center justify-center rounded-sm">
                <CircleDollarSign className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-lg font-semibold">
                {credentialIssue
                  ? "Revenue analytics are temporarily unavailable"
                  : "Revenue data is ready to synchronize"}
              </h2>
              <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-6">
                {credentialIssue
                  ? "Connect a Console credential from the same Apify account as this workspace API key. Revenue sync will resume after the accounts match."
                  : "Use Sync usage at the top of this page to import Apify monetization data for this workspace. Revenue and profit will appear only for Actors whose owner analytics are available."}
              </p>
              <p className="text-muted-foreground mt-3 max-w-xl text-xs leading-5">
                Free-user runs can add runs, results, and platform costs, but they do not generate
                Actor revenue.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <MetricCard
                label="Actor revenue"
                value={money.format(revenueTotals.revenue)}
                detail={
                  comparePeriods && revenue?.comparison ? (
                    <MetricDelta
                      current={revenueTotals.revenue}
                      previous={revenue.comparison.previous.revenueUsd}
                    />
                  ) : (
                    "Paid usage across selected Actors"
                  )
                }
                icon={CircleDollarSign}
              />
              <MetricCard
                label="Direct Actor cost"
                value={money.format(revenueTotals.cost)}
                detail="Run cost reported for selected Actors"
                icon={DollarSign}
              />
              <MetricCard
                label="Allocated platform cost"
                value={
                  revenueTotals.allocatedCostAvailable
                    ? money.format(revenueTotals.allocatedCost)
                    : "—"
                }
                detail="Direct cost plus proportional workspace overhead"
                icon={Gauge}
              />
              <MetricCard
                label="Net profit"
                value={
                  revenueTotals.allocatedCostAvailable ? money.format(revenueTotals.profit) : "—"
                }
                detail={
                  revenueTotals.allocatedCostAvailable && comparePeriods && revenue?.comparison ? (
                    <MetricDelta
                      current={revenueTotals.profit}
                      previous={revenue.comparison.previous.netProfitUsd}
                    />
                  ) : (
                    "Revenue after allocated platform cost"
                  )
                }
                icon={TrendingUp}
              />
              <MetricCard
                label="Runs"
                value={revenueTotals.runs.toLocaleString("en-US")}
                detail={`${revenueTotals.results.toLocaleString("en-US")} results`}
                icon={Activity}
              />
              <MetricCard
                label="Active user-days"
                value={revenueTotals.activeUsers.toLocaleString("en-US")}
                detail={
                  revenueMargin == null
                    ? "Margin unavailable"
                    : `${revenueMargin.toFixed(1)}% net margin`
                }
                icon={Users}
              />
            </div>

            {revenue?.coverage &&
            (revenue.coverage.allocatedCostCoveredRows < revenue.coverage.rows ||
              revenue.coverage.failedActorSyncs > 0) ? (
              <Card className="border-signal-orange/40 bg-signal-orange/5">
                <CardContent className="flex gap-3 p-5">
                  <ShieldAlert className="text-signal-orange mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">Financial coverage is partial</p>
                    <p className="text-muted-foreground mt-1 text-xs leading-5">
                      Allocated costs are available for {revenue.coverage.allocatedCostCoveredRows}{" "}
                      of {revenue.coverage.rows} Actor-day rows. Missing cost is displayed as
                      unavailable, never as $0.00. {revenue.coverage.failedActorSyncs} Actor sync
                      {revenue.coverage.failedActorSyncs === 1 ? " needs" : "s need"} attention.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="min-w-0">
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                <div>
                  <CardTitle>
                    {revenueGranularity === "day" ? "Daily" : "Monthly"}{" "}
                    {selectedMetric.label.toLowerCase()}
                  </CardTitle>
                  <p className="text-muted-foreground mt-1 text-xs">
                    The chart follows the Actor, period, metric, and comparison scope above.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div
                    className="flex gap-1 rounded-sm border p-1"
                    role="group"
                    aria-label="Revenue chart granularity"
                  >
                    <Button
                      size="sm"
                      variant={revenueGranularity === "day" ? "secondary" : "ghost"}
                      onClick={() => updateUrlFilters({ granularity: null })}
                    >
                      Daily
                    </Button>
                    <Button
                      size="sm"
                      variant={revenueGranularity === "month" ? "secondary" : "ghost"}
                      onClick={() => updateUrlFilters({ granularity: "month" })}
                    >
                      Monthly
                    </Button>
                  </div>
                  <TrendModeToggle
                    mode={revenueMode}
                    onChange={(mode) =>
                      updateUrlFilters({ mode: mode === "absolute" ? null : mode })
                    }
                    label="Revenue chart display"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <ChartFrame
                  ariaLabel={`${selectedMetric.label} revenue trend`}
                  series={revenueSeries}
                  status={revenueTrend.length ? "ready" : "empty"}
                  statusMessage={`No ${selectedMetric.label.toLowerCase()} was synchronized for this scope.`}
                  options={{ showSeriesControls: false, compact: true }}
                  chartClassName="h-80 min-w-0"
                >
                  {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                    <ResponsiveContainer width="100%" height="100%" debounce={0}>
                      <AreaChart
                        data={revenueTrend}
                        margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                      >
                        <CartesianGrid
                          vertical={false}
                          stroke="var(--color-border)"
                          strokeOpacity={0.55}
                        />
                        <XAxis
                          dataKey="label"
                          hide={!axisLabelsVisible}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={24}
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                        <YAxis
                          hide={!axisLabelsVisible}
                          axisLine={false}
                          tickLine={false}
                          width={58}
                          tickFormatter={(value) =>
                            selectedMetric.currency
                              ? money.format(Number(value))
                              : Number(value).toLocaleString("en-US")
                          }
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                        <Tooltip content={<ChartTooltip series={revenueSeries} />} />
                        <Area
                          type="monotone"
                          dataKey={selectedMetric.dataKey}
                          name={revenueSeries[0].label}
                          hide={!visibleSeries.has(selectedMetric.dataKey)}
                          stroke={selectedMetric.color}
                          strokeWidth={2.5}
                          fill={selectedMetric.color}
                          fillOpacity={0.12}
                          dot={false}
                          activeDot={{ r: 4 }}
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
              </CardContent>
            </Card>

            {comparisonActors.length > 1 ? (
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Actor comparison</CardTitle>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Compare the selected metric across up to five Actors without losing the daily
                    source records below.
                  </p>
                </CardHeader>
                <CardContent>
                  {comparisonActors.length <= 5 ? (
                    <ChartFrame
                      ariaLabel="Selected Actor comparison trend"
                      series={comparisonSeries}
                      status={actorComparisonTrend.length ? "ready" : "empty"}
                      statusMessage="No comparison data is available for the selected Actors."
                      options={{ compact: true }}
                      chartClassName="h-72 min-w-0"
                    >
                      {({ axisLabelsVisible, dataLabelsVisible, visibleSeries }) => (
                        <ResponsiveContainer width="100%" height="100%" debounce={0}>
                          <LineChart
                            data={actorComparisonTrend}
                            margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                          >
                            <CartesianGrid
                              vertical={false}
                              stroke="var(--color-border)"
                              strokeOpacity={0.55}
                            />
                            <XAxis
                              dataKey="label"
                              hide={!axisLabelsVisible}
                              axisLine={false}
                              tickLine={false}
                              minTickGap={24}
                              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                            />
                            <YAxis
                              hide={!axisLabelsVisible}
                              axisLine={false}
                              tickLine={false}
                              width={58}
                              tickFormatter={(value) =>
                                selectedMetric.currency
                                  ? money.format(Number(value))
                                  : Number(value).toLocaleString("en-US")
                              }
                              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                            />
                            <Tooltip content={<ChartTooltip series={comparisonSeries} />} />
                            {comparisonActors.map((actor, index) => (
                              <Line
                                key={actor.id}
                                type="monotone"
                                dataKey={actor.id}
                                name={comparisonSeries[index]?.label}
                                hide={!visibleSeries.has(actor.id)}
                                stroke={comparisonColors[index]}
                                strokeWidth={2.25}
                                dot={false}
                                activeDot={{ r: 4 }}
                                label={dataLabelsVisible}
                                isAnimationActive={false}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </ChartFrame>
                  ) : (
                    <EmptyChart>
                      Select no more than five Actors to compare individual trend lines.
                    </EmptyChart>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
                <div>
                  <CardTitle>Revenue by Actor</CardTitle>
                  <p className="text-muted-foreground mt-1 max-w-3xl text-xs leading-5">
                    Compare synchronized totals for the selected period. Use the Actor selector
                    above to update this table, cards, chart, and ledger together.
                  </p>
                  {revenue?.syncedAt ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Last synchronized{" "}
                      {new Date(revenue.syncedAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                        timeZone: "UTC",
                        timeZoneName: "short",
                      })}
                    </p>
                  ) : null}
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <Input
                    value={revenueQuery}
                    onChange={(event) => {
                      setRevenueQuery(event.target.value);
                      setRevenuePage(1);
                    }}
                    placeholder="Find in this table"
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {filteredRevenueActors.length ? (
                  <>
                    <div className="overflow-x-auto rounded-sm border">
                      <table className="w-full min-w-[1120px] border-collapse text-sm">
                        <thead className="bg-muted/55 text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">Actor</th>
                            <th className="px-3 py-3 text-right font-medium">
                              {revenueSortHeader("revenue", "Revenue")}
                            </th>
                            <th className="px-3 py-3 text-right font-medium">
                              {revenueSortHeader("directCost", "Direct cost")}
                            </th>
                            <th className="px-3 py-3 text-right font-medium">
                              {revenueSortHeader("allocatedCost", "Allocated cost")}
                            </th>
                            <th className="px-3 py-3 text-right font-medium">
                              {revenueSortHeader("profit", "Net profit")}
                            </th>
                            <th className="px-3 py-3 text-right font-medium">
                              {revenueSortHeader("margin", "Margin")}
                            </th>
                            <th className="px-3 py-3 text-right font-medium">
                              {revenueSortHeader("runs", "Runs")}
                            </th>
                            <th className="px-3 py-3 text-right font-medium">
                              {revenueSortHeader("results", "Results")}
                            </th>
                            <th className="px-4 py-3 text-right font-medium">Share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-border divide-y">
                          {visibleRevenueActors.map((actor) => (
                            <tr key={actor.id}>
                              <td className="px-4 py-4">
                                <Link
                                  href={`/dashboard/actors/${actor.id}`}
                                  className="hover:text-signal-blue inline-flex max-w-xs items-center gap-1 truncate font-semibold"
                                >
                                  {actor.title ?? actor.actorName}
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </Link>
                                <p className="text-muted-foreground max-w-xs truncate text-xs">
                                  {actor.username}/{actor.actorName}
                                </p>
                              </td>
                              <td className="px-3 py-4 text-right font-mono tabular-nums">
                                {money.format(actor.revenueUsd)}
                                {comparePeriods ? (
                                  <CompactMetricDelta
                                    current={actor.revenueUsd}
                                    previous={actor.previousRevenueUsd}
                                  />
                                ) : null}
                              </td>
                              <td className="px-3 py-4 text-right font-mono tabular-nums">
                                {money.format(actor.costUsd)}
                              </td>
                              <td className="px-3 py-4 text-right font-mono tabular-nums">
                                {actor.allocatedCostAvailable
                                  ? money.format(actor.allocatedCostUsd)
                                  : "Unavailable"}
                              </td>
                              <td
                                className={`px-3 py-4 text-right font-mono tabular-nums ${
                                  actor.netProfitUsd > 0
                                    ? "text-signal-green"
                                    : actor.netProfitUsd < 0
                                      ? "text-signal-orange"
                                      : ""
                                }`}
                              >
                                {actor.allocatedCostAvailable
                                  ? money.format(actor.netProfitUsd)
                                  : "—"}
                                {comparePeriods && actor.allocatedCostAvailable ? (
                                  <CompactMetricDelta
                                    current={actor.netProfitUsd}
                                    previous={actor.previousNetProfitUsd}
                                  />
                                ) : null}
                              </td>
                              <td className="px-3 py-4 text-right font-mono tabular-nums">
                                {actor.margin == null ? "—" : `${actor.margin.toFixed(1)}%`}
                              </td>
                              <td className="px-3 py-4 text-right font-mono tabular-nums">
                                {actor.runs.toLocaleString("en-US")}
                                {comparePeriods ? (
                                  <CompactMetricDelta
                                    current={actor.runs}
                                    previous={actor.previousRuns}
                                  />
                                ) : null}
                              </td>
                              <td className="px-3 py-4 text-right font-mono tabular-nums">
                                {actor.results.toLocaleString("en-US")}
                              </td>
                              <td className="px-4 py-4 text-right font-mono tabular-nums">
                                {actor.share.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-border bg-muted/35 border-t">
                          <tr className="font-semibold">
                            <td className="px-4 py-3">Actor subtotal</td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {money.format(revenueTotals.revenue)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {money.format(revenueTotals.cost)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {revenueTotals.allocatedCostAvailable
                                ? money.format(revenueTotals.allocatedCost)
                                : "—"}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {revenueTotals.allocatedCostAvailable
                                ? money.format(revenueTotals.profit)
                                : "—"}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {revenueMargin == null ? "—" : `${revenueMargin.toFixed(1)}%`}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {revenueTotals.runs.toLocaleString("en-US")}
                            </td>
                            <td className="px-3 py-3 text-right font-mono tabular-nums">
                              {revenueTotals.results.toLocaleString("en-US")}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">
                              {revenueTotals.revenue > 0 ? "100.0%" : "0.0%"}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <ReportPagination
                      page={currentRevenuePage}
                      pageSize={revenuePageSize}
                      total={filteredRevenueActors.length}
                      label="Revenue actors per page"
                      onPageChange={setRevenuePage}
                      onPageSizeChange={setRevenuePageSize}
                    />
                    {revenue?.unavailableActors ? (
                      <p className="text-muted-foreground mt-4 text-xs">
                        Revenue analytics are unavailable for {revenue.unavailableActors} Actor
                        {revenue.unavailableActors === 1 ? "" : "s"}; those Actors are excluded from
                        this subtotal.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <EmptyChart>No revenue Actors match this search.</EmptyChart>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
                <div>
                  <CardTitle>Daily Actor ledger</CardTitle>
                  <p className="text-muted-foreground mt-1 max-w-3xl text-xs leading-5">
                    Every chart point is traceable to these UTC Actor-day records. Allocated cost
                    adds workspace overhead proportionally to each Actor&apos;s direct daily usage.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!ledgerRows.length}
                  onClick={() => downloadLedgerCsv(ledgerRows)}
                >
                  <Download className="h-4 w-4" />
                  {ledgerTruncated ? "Export displayed CSV" : "Export CSV"}
                </Button>
              </CardHeader>
              <CardContent>
                {ledgerTruncated ? (
                  <div className="border-signal-blue/35 bg-signal-blue/8 mb-4 rounded-sm border px-4 py-3 text-xs leading-5">
                    Showing the newest {ledgerRows.length.toLocaleString("en-US")} of{" "}
                    {ledgerTotal.toLocaleString("en-US")} Actor-day records. Select one or more
                    Actors above to load a focused ledger and export its complete rows.
                  </div>
                ) : null}
                {ledgerRows.length ? (
                  <>
                    <div className="space-y-3 md:hidden">
                      {visibleLedgerRows.map((row) => (
                        <article
                          key={`${row.actorId}:${row.date}`}
                          className="border-border rounded-sm border p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-mono text-[10px] uppercase tracking-wider">
                                {row.date}
                              </p>
                              <Link
                                href={`/dashboard/actors/${row.actorId}`}
                                className="mt-1 block truncate text-sm font-semibold"
                              >
                                {row.title ?? row.actorName}
                              </Link>
                            </div>
                            <span className="text-signal-green font-mono text-sm">
                              {row.revenueUsd == null ? "—" : money.format(row.revenueUsd)}
                            </span>
                          </div>
                          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                            <div>
                              <dt className="text-muted-foreground">Direct cost</dt>
                              <dd className="mt-1 font-mono">
                                {row.directCostUsd == null
                                  ? "Unavailable"
                                  : money.format(row.directCostUsd)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Allocated cost</dt>
                              <dd className="mt-1 font-mono">
                                {row.allocatedCostUsd == null
                                  ? "Unavailable"
                                  : money.format(row.allocatedCostUsd)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Net profit</dt>
                              <dd className="mt-1 font-mono">
                                {row.netProfitUsd == null ? "—" : money.format(row.netProfitUsd)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Activity</dt>
                              <dd className="mt-1 font-mono">
                                {row.runs} runs · {row.results} results
                              </dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto rounded-sm border md:block">
                      <table className="w-full min-w-[1120px] border-collapse text-sm">
                        <thead className="bg-muted/55 text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">Date</th>
                            <th className="px-4 py-3 text-left font-medium">Actor</th>
                            <th className="px-3 py-3 text-right font-medium">Revenue</th>
                            <th className="px-3 py-3 text-right font-medium">Direct cost</th>
                            <th className="px-3 py-3 text-right font-medium">Allocated cost</th>
                            <th className="px-3 py-3 text-right font-medium">Net profit</th>
                            <th className="px-3 py-3 text-right font-medium">Runs</th>
                            <th className="px-3 py-3 text-right font-medium">Results</th>
                            <th className="px-4 py-3 text-right font-medium">Active users</th>
                          </tr>
                        </thead>
                        <tbody className="divide-border divide-y">
                          {visibleLedgerRows.map((row) => (
                            <tr key={`${row.actorId}:${row.date}`}>
                              <td className="px-4 py-3 font-mono text-xs">{row.date}</td>
                              <td className="px-4 py-3">
                                <Link
                                  href={`/dashboard/actors/${row.actorId}`}
                                  className="hover:text-signal-blue font-semibold"
                                >
                                  {row.title ?? row.actorName}
                                </Link>
                                <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                                  {row.username}/{row.actorName}
                                </p>
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                {row.revenueUsd == null ? "—" : money.format(row.revenueUsd)}
                              </td>
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
                              <td className="px-3 py-3 text-right font-mono">
                                {row.netProfitUsd == null ? "—" : money.format(row.netProfitUsd)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                {row.runs.toLocaleString("en-US")}
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                {row.results.toLocaleString("en-US")}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {row.activeUsers == null
                                  ? "—"
                                  : row.activeUsers.toLocaleString("en-US")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ReportPagination
                      page={currentLedgerPage}
                      pageSize={ledgerPageSize}
                      total={ledgerRows.length}
                      label="Ledger rows per page"
                      onPageChange={setLedgerPage}
                      onPageSizeChange={setLedgerPageSize}
                    />
                  </>
                ) : (
                  <EmptyChart>No Actor-day records match the selected scope.</EmptyChart>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>
    </DashboardUrlTabs>
  );
}
