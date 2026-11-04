export interface FinancialResponseMeta {
  cached?: boolean;
  stale?: boolean;
  syncedAt?: string | null;
  requestId?: string | null;
  retryAfterSeconds?: number | null;
}

export interface ServiceUsage {
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
  meta?: FinancialResponseMeta;
  details?: {
    snapshotId: string;
    query: string;
    workspaceId: string | null;
    initialPage?: FinancialTablePage & { sort: FinancialSortKey; direction: "asc" | "desc" };
  };
  usageTotals?: {
    runs: number;
    successful: number;
    failed: number;
    results: number;
    users: number;
  };
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

export interface FinancialTotals {
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

type FinancialLedger = NonNullable<UsageCostsPayload["revenue"]>["ledger"];
export type FinancialSortKey =
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

export interface FinancialTableRow {
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

export type ActorTableView = "total" | "daily" | "weekly";

type TableRow = FinancialTableRow;

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

export function actorFinancialTotalRows(
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

export function usageActorTotalRows(payload: UsageCostsPayload): FinancialTableRow[] {
  const { from = "", to = "9999-12-31", day = null, actorIds = [] } = payload.filters ?? {};
  const financial = new Map(payload.revenue?.actors.map((actor) => [actor.id, actor]));
  return payload.items
    .filter((actor) => !actorIds.length || actorIds.includes(actor.id))
    .map((actor): FinancialTableRow => {
      const daily = actor.usageDaily.filter((row) => {
        const date = financialDateKey(row.date);
        return date >= from && date <= to && (!day || date === day);
      });
      const totals = day
        ? payload.revenue?.ledger.find((row) => row.actorId === actor.id && row.date === day)
        : financial.get(actor.id);
      return {
        key: actor.id,
        actorId: actor.id,
        apifyActorId: actor.apifyActorId,
        name: actor.title ?? actor.actorName,
        slug: `${actor.username}/${actor.actorName}`,
        date: day,
        runs: totals?.runs ?? daily.reduce((sum, row) => sum + row.runs, 0),
        successfulRuns:
          totals?.successfulRuns ?? daily.reduce((sum, row) => sum + (row.successfulRuns ?? 0), 0),
        failedRuns:
          totals?.failedRuns ?? daily.reduce((sum, row) => sum + (row.failedRuns ?? 0), 0),
        results: totals?.results ?? daily.reduce((sum, row) => sum + (row.resultCount ?? 0), 0),
        activeUsers: totals?.activeUsers ?? null,
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
}

export function financialTableRows(
  payload: UsageCostsPayload,
  kind: "usage" | "costs" | "revenue",
  table: ActorTableView,
): FinancialTableRow[] {
  if (kind === "usage") {
    if (table === "total" || payload.filters?.day) return usageActorTotalRows(payload);
    const ids = payload.filters?.actorIds ?? [];
    return usagePeriodRows(
      payload.items.filter((actor) => !ids.length || ids.includes(actor.id)),
      payload.filters?.from ?? "",
      payload.filters?.to ?? "9999-12-31",
      table,
    );
  }
  const ledger = payload.revenue?.ledger ?? [];
  const rows =
    table === "daily"
      ? dailyFinancialLedgerRows(ledger)
      : table === "weekly"
        ? weeklyFinancialLedgerRows(ledger)
        : actorFinancialTotalRows(payload.revenue?.actors ?? []);
  const cost = rows.reduce((sum, row) => sum + (row.directCostUsd ?? 0), 0);
  return rows.map((row) => ({
    ...row,
    costShare: row.directCostUsd == null || cost <= 0 ? null : (row.directCostUsd / cost) * 100,
  }));
}

export interface FinancialTablePage {
  items: FinancialTableRow[];
  total: number;
  page: number;
  pageSize: number;
  snapshotId: string;
}

export function sortFinancialRows(
  rows: FinancialTableRow[],
  query: string,
  sort: FinancialSortKey,
  direction: "asc" | "desc",
) {
  const value = (row: FinancialTableRow): number | string => {
    if (sort === "name") return row.name.toLowerCase();
    if (sort === "date") return row.date ?? "";
    const keys = {
      runs: "runs",
      success: "successfulRuns",
      failed: "failedRuns",
      results: "results",
      users: "activeUsers",
      direct: "directCostUsd",
      allocated: "allocatedCostUsd",
      revenue: "revenueUsd",
      profit: "netProfitUsd",
      share: "costShare",
      margin: "margin",
    } as const;
    return row[keys[sort]] ?? -1;
  };
  return rows
    .filter((row) => `${row.name} ${row.slug}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => {
      const a = value(left);
      const b = value(right);
      const order = typeof a === "string" ? a.localeCompare(String(b)) : Number(a) - Number(b);
      return (direction === "asc" ? order : -order) || left.key.localeCompare(right.key);
    });
}
