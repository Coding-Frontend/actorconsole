import { db } from "@actorconsole/db";
import type { UserSession } from "@actorconsole/shared";
import type { ApifyActorMonetizationItem } from "@actorconsole/apify";
import { AppError } from "../middleware/error.js";
import { CACHE_MISS, cacheGet, cacheSet } from "./cache.js";
import { dateQuery, stringQuery } from "./query.js";
import { businessProfileScope } from "./business-profile.js";

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function utcWeekStartKey(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function financialPeriodKey(day: string, granularity: "day" | "week" | "month") {
  if (granularity === "day") return day;
  if (granularity === "week") return utcWeekStartKey(day);
  return day.slice(0, 7);
}

/** Cached, read-only financial reporting shared by workspace and account dashboards. */
export async function loadWorkspaceFinancialReport({
  session,
  query,
  requestId = null,
}: {
  session: UserSession;
  query: (key: string) => string | undefined;
  requestId?: string | null;
}) {
  const granularityQuery = query("granularity");
  const granularity =
    granularityQuery === "month" ? "month" : granularityQuery === "week" ? "week" : "day";
  const tableGrouping = query("table") === "weekly" ? "weekly" : "daily";
  const mode = query("mode") === "cumulative" ? "cumulative" : "absolute";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const defaultFrom = new Date(today.getTime() - 29 * 86_400_000);
  const from = dateQuery(query("from"), "from") ?? defaultFrom;
  const to = dateQuery(query("to"), "to") ?? today;
  const selectedDay = dateQuery(query("day"), "day");
  if (from > to) {
    throw new AppError("invalid_query", "from must be on or before to", 400);
  }
  if (selectedDay && (selectedDay < from || selectedDay > to)) {
    throw new AppError("invalid_query", "day must be inside the selected date range", 400);
  }
  const rangeDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (rangeDays > 370) {
    throw new AppError("invalid_query", "Usage and revenue ranges cannot exceed 370 days", 400);
  }
  const toExclusive = new Date(to.getTime() + 86_400_000);
  const previousTo = new Date(from.getTime() - 86_400_000);
  const previousFrom = new Date(previousTo.getTime() - (rangeDays - 1) * 86_400_000);
  const requestedActorIds = Array.from(
    new Set(
      (query("actorIds") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  if (requestedActorIds.length > 500) {
    throw new AppError("invalid_query", "actorIds accepts at most 500 Actor IDs", 400);
  }
  const requestedApifyActorId = stringQuery(query("apifyActorId"), "apifyActorId", 250);
  if (requestedApifyActorId && requestedActorIds.length) {
    throw new AppError(
      "invalid_query",
      "Use either actorIds or apifyActorId to filter a financial report",
      400,
    );
  }
  const currentRevenueStart = new Date();
  currentRevenueStart.setUTCDate(1);
  currentRevenueStart.setUTCHours(0, 0, 0, 0);
  const actorsPromise = db.actor.findMany({
    where: {
      userId: session.userId,
      ...businessProfileScope(session),
      ...(session.apiKeyActorIds?.length ? { apifyActorId: { in: session.apiKeyActorIds } } : {}),
    },
    select: {
      id: true,
      apifyActorId: true,
      title: true,
      actorName: true,
      username: true,
      lastRunSyncAt: true,
      lastInsightSyncAt: true,
      insightSyncStatus: true,
      insightSyncError: true,
      usageDaily: {
        where: { date: { gte: previousFrom, lt: toExclusive } },
        orderBy: { date: "asc" },
        // The report loads both the selected range and its equal-length comparison
        // range. A 370-day report therefore needs at most 740 daily records,
        // while the default 30-day dashboard only reads the 60 rows it can
        // actually display. This keeps the common report bounded without
        // changing the explicit long-range behavior.
        take: Math.min(rangeDays * 2, 740),
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  const usageCacheKey = `workspace:${session.businessProfileId ?? session.userId}:apify-usage:v4`;
  const [actors, accountUsageValue, persistedAccountUsage] = await Promise.all([
    actorsPromise,
    cacheGet<Record<string, unknown>>(usageCacheKey),
    session.businessProfileId
      ? db.workspaceFinancialCache.findUnique({
          where: { businessProfileId: session.businessProfileId },
          select: { payload: true },
        })
      : Promise.resolve(null),
  ]);
  const selectedApifyActor = requestedApifyActorId
    ? actors.find((actor) => actor.apifyActorId === requestedApifyActorId)
    : null;
  if (requestedApifyActorId && !selectedApifyActor) {
    throw new AppError("not_found", `Actor ${requestedApifyActorId} not found`, 404);
  }
  if (selectedApifyActor) requestedActorIds.push(selectedApifyActor.id);
  const allowedActorIds = new Set(actors.map((actor) => actor.id));
  const invalidActorIds = requestedActorIds.filter((actorId) => !allowedActorIds.has(actorId));
  if (invalidActorIds.length) {
    throw new AppError(
      "invalid_query",
      "One or more selected Actors are not in this workspace",
      400,
    );
  }
  const selectedActorIds = requestedActorIds.length
    ? requestedActorIds
    : actors.map((actor) => actor.id);
  const selectedActorIdSet = new Set(selectedActorIds);
  const dailyActorInsights = selectedActorIds.length
    ? await db.actorInsightSnapshot.groupBy({
        by: ["actorId", "capturedOn"],
        where: {
          actorId: { in: selectedActorIds },
          capturedOn: { gte: previousFrom, lt: toExclusive },
          OR: [
            { totalRuns: { not: null } },
            { resultCount: { not: null } },
            { activeUsers: { not: null } },
            { costUsd: { not: null } },
            { revenueUsd: { not: null } },
            { profitUsd: { not: null } },
          ],
        },
        _sum: {
          totalRuns: true,
          succeededRuns: true,
          failedRuns: true,
          resultCount: true,
          activeUsers: true,
          costUsd: true,
          revenueUsd: true,
          profitUsd: true,
        },
        _count: {
          costUsd: true,
          revenueUsd: true,
          profitUsd: true,
          activeUsers: true,
        },
        _max: { capturedAt: true },
        orderBy: { capturedOn: "asc" },
      })
    : [];
  const workspaceDailyInsightTotals =
    requestedActorIds.length && actors.length
      ? await db.actorInsightSnapshot.groupBy({
          by: ["capturedOn"],
          where: {
            actorId: { in: actors.map((actor) => actor.id) },
            capturedOn: { gte: previousFrom, lt: toExclusive },
            OR: [{ totalRuns: { not: null } }, { costUsd: { not: null } }],
          },
          _sum: { totalRuns: true, costUsd: true },
          _count: { costUsd: true },
          orderBy: { capturedOn: "asc" },
        })
      : [];
  const accountUsage =
    accountUsageValue === CACHE_MISS
      ? ((persistedAccountUsage?.payload as Record<string, unknown> | undefined) ?? null)
      : accountUsageValue;
  if (accountUsageValue === CACHE_MISS && accountUsage) {
    // Rehydrate the hot cache from durable storage without delaying the
    // cached-first response. A failed Redis write must not hide the report.
    void cacheSet(usageCacheKey, accountUsage, 24 * 60 * 60).catch(() => undefined);
  }
  const ownerMonetization =
    accountUsage &&
    typeof accountUsage === "object" &&
    "ownerMonetization" in accountUsage &&
    accountUsage.ownerMonetization &&
    typeof accountUsage.ownerMonetization === "object"
      ? (accountUsage.ownerMonetization as {
          month?: string;
          actors?: ApifyActorMonetizationItem[];
          coveredActors?: number;
          failedActors?: number;
        })
      : null;
  const latestSyncAt = actors.reduce<Date | null>(
    (latest, actor) =>
      !actor.lastRunSyncAt || (latest && latest >= actor.lastRunSyncAt)
        ? latest
        : actor.lastRunSyncAt,
    null,
  );
  type RevenueBucket = {
    costUsd: number;
    allocatedCostUsd: number;
    revenueUsd: number;
    profitUsd: number;
    netProfitUsd: number;
    runs: number;
    successfulRuns: number;
    failedRuns: number;
    results: number;
    activeUsers: number;
    costCoveredDays: number;
    allocatedCoveredDays: number;
    revenueCoveredDays: number;
    activeUsersCoveredDays: number;
  };
  const emptyRevenueBucket = (): RevenueBucket => ({
    costUsd: 0,
    allocatedCostUsd: 0,
    revenueUsd: 0,
    profitUsd: 0,
    netProfitUsd: 0,
    runs: 0,
    successfulRuns: 0,
    failedRuns: 0,
    results: 0,
    activeUsers: 0,
    costCoveredDays: 0,
    allocatedCoveredDays: 0,
    revenueCoveredDays: 0,
    activeUsersCoveredDays: 0,
  });
  const dailyRevenue = new Map<string, RevenueBucket>();
  const weeklyRevenue = new Map<string, RevenueBucket>();
  const monthlyRevenue = new Map<string, RevenueBucket>();
  const currentRevenueMonth = currentRevenueStart.toISOString().slice(0, 7);
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));
  let revenueSyncedAt: Date | null = null;
  type LedgerRow = {
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
    successfulRuns: number;
    failedRuns: number;
    results: number;
    activeUsers: number | null;
    costSource: "run-data" | "owner-analytics" | "unavailable";
    capturedAt: string | null;
  };
  const ledgerByActorDay = new Map<string, LedgerRow>();
  for (const insight of dailyActorInsights) {
    const actor = actorsById.get(insight.actorId);
    if (!actor) continue;
    const date = insight.capturedOn.toISOString().slice(0, 10);
    const costAvailable = insight._count.costUsd > 0;
    const revenueAvailable = insight._count.revenueUsd > 0;
    const profitAvailable = insight._count.profitUsd > 0;
    const directCostUsd = costAvailable ? Number(insight._sum.costUsd ?? 0) : null;
    const revenueUsd = revenueAvailable ? Number(insight._sum.revenueUsd ?? 0) : null;
    const profitUsd = profitAvailable
      ? Number(insight._sum.profitUsd ?? 0)
      : revenueUsd != null && directCostUsd != null
        ? revenueUsd - directCostUsd
        : null;
    const key = `${actor.id}:${date}`;
    ledgerByActorDay.set(key, {
      actorId: actor.id,
      apifyActorId: actor.apifyActorId,
      title: actor.title,
      actorName: actor.actorName,
      username: actor.username,
      date,
      directCostUsd,
      allocatedCostUsd: null,
      revenueUsd,
      profitUsd,
      netProfitUsd: profitUsd,
      margin: revenueUsd && profitUsd != null ? (profitUsd / revenueUsd) * 100 : null,
      runs: Number(insight._sum.totalRuns ?? 0),
      successfulRuns: Number(insight._sum.succeededRuns ?? 0),
      failedRuns: Number(insight._sum.failedRuns ?? 0),
      results: Number(insight._sum.resultCount ?? 0),
      activeUsers: insight._count.activeUsers > 0 ? Number(insight._sum.activeUsers ?? 0) : null,
      costSource: costAvailable ? "owner-analytics" : "unavailable",
      capturedAt: insight._max.capturedAt?.toISOString() ?? null,
    });
    const capturedAt = insight._max.capturedAt;
    if (capturedAt && (!revenueSyncedAt || capturedAt > revenueSyncedAt)) {
      revenueSyncedAt = capturedAt;
    }
  }
  for (const actor of actors) {
    if (!selectedActorIdSet.has(actor.id)) continue;
    for (const usage of actor.usageDaily) {
      const date = usage.date.toISOString().slice(0, 10);
      const key = `${actor.id}:${date}`;
      const existing = ledgerByActorDay.get(key);
      const directCostUsd = Number(usage.usageCostUsd);
      const revenueUsd = existing?.revenueUsd ?? null;
      const profitUsd = revenueUsd == null ? null : revenueUsd - directCostUsd;
      ledgerByActorDay.set(key, {
        actorId: actor.id,
        apifyActorId: actor.apifyActorId,
        title: actor.title,
        actorName: actor.actorName,
        username: actor.username,
        date,
        directCostUsd,
        allocatedCostUsd: null,
        revenueUsd,
        profitUsd,
        netProfitUsd: profitUsd,
        margin: revenueUsd && profitUsd != null ? (profitUsd / revenueUsd) * 100 : null,
        runs: usage.runs,
        successfulRuns: usage.successfulRuns,
        failedRuns: usage.failedRuns,
        results: Number(usage.resultCount ?? existing?.results ?? 0),
        activeUsers: existing?.activeUsers ?? null,
        costSource: "run-data",
        capturedAt: existing?.capturedAt ?? actor.lastRunSyncAt?.toISOString() ?? null,
      });
    }
  }
  const allLedger = [...ledgerByActorDay.values()].sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.actorName.localeCompare(right.actorName),
  );
  const accountDailyCosts = new Map<string, number>();
  const accountUsageRecord = jsonRecord(accountUsage);
  const calendarMonthRecord = jsonRecord(accountUsageRecord.calendarMonth);
  const calendarDailyRecord = jsonRecord(calendarMonthRecord.dailyServiceUsage);
  for (const [date, rawRows] of Object.entries(calendarDailyRecord)) {
    if (!Array.isArray(rawRows)) continue;
    const total = rawRows.reduce((sum, rawRow) => {
      const row = jsonRecord(rawRow);
      return sum + Number(row.amountAfterVolumeDiscountUsd ?? row.baseAmountUsd ?? 0);
    }, 0);
    accountDailyCosts.set(date.slice(0, 10), total);
  }
  const currentPeriodRecord = jsonRecord(accountUsageRecord.currentPeriod);
  const currentUsageRecord = jsonRecord(currentPeriodRecord.usage);
  const currentDailyRows = currentUsageRecord.dailyServiceUsages;
  if (Array.isArray(currentDailyRows)) {
    for (const rawRow of currentDailyRows) {
      const row = jsonRecord(rawRow);
      if (typeof row.date !== "string") continue;
      accountDailyCosts.set(row.date.slice(0, 10), Number(row.totalUsageCreditsUsd ?? 0));
    }
  }
  const workspaceDailyWeights = new Map<
    string,
    { directCostUsd: number; runs: number; actorRows: number }
  >();
  if (requestedActorIds.length) {
    for (const insight of workspaceDailyInsightTotals) {
      const date = insight.capturedOn.toISOString().slice(0, 10);
      workspaceDailyWeights.set(date, {
        directCostUsd: insight._count.costUsd > 0 ? Number(insight._sum.costUsd ?? 0) : 0,
        runs: Number(insight._sum.totalRuns ?? 0),
        actorRows: actors.length,
      });
    }
    const workspaceInsightDates = new Set(workspaceDailyWeights.keys());
    // A workspace may have older run-level billing without an owner-insight
    // snapshot for the same date. Use it only as a fallback denominator so
    // selected-Actor filters never inherit the entire account overhead.
    for (const actor of actors) {
      for (const usage of actor.usageDaily) {
        const date = usage.date.toISOString().slice(0, 10);
        if (workspaceInsightDates.has(date)) continue;
        const totals = workspaceDailyWeights.get(date) ?? {
          directCostUsd: 0,
          runs: 0,
          actorRows: 0,
        };
        totals.directCostUsd += Number(usage.usageCostUsd);
        totals.runs += usage.runs;
        totals.actorRows += 1;
        workspaceDailyWeights.set(date, totals);
      }
    }
  } else {
    // For the normal all-Actor report, derive the denominator from the same
    // merged ledger rows being allocated. This guarantees that all Actor
    // weights for a day add up to one instead of multiplying overhead when
    // UsageDaily happens to contain only a subset of Actors.
    for (const row of allLedger) {
      const totals = workspaceDailyWeights.get(row.date) ?? {
        directCostUsd: 0,
        runs: 0,
        actorRows: 0,
      };
      totals.directCostUsd += row.directCostUsd ?? 0;
      totals.runs += row.runs;
      totals.actorRows += 1;
      workspaceDailyWeights.set(row.date, totals);
    }
  }
  for (const row of allLedger) {
    const accountCost = accountDailyCosts.get(row.date);
    const workspace = workspaceDailyWeights.get(row.date);
    if (accountCost == null || !workspace || row.directCostUsd == null) continue;
    const overheadUsd = Math.max(0, accountCost - workspace.directCostUsd);
    const weight =
      workspace.directCostUsd > 0
        ? row.directCostUsd / workspace.directCostUsd
        : workspace.runs > 0
          ? row.runs / workspace.runs
          : workspace.actorRows > 0
            ? 1 / workspace.actorRows
            : 0;
    row.allocatedCostUsd = row.directCostUsd + overheadUsd * weight;
    row.netProfitUsd = row.revenueUsd == null ? null : row.revenueUsd - row.allocatedCostUsd;
  }
  const fromKey = from.toISOString().slice(0, 10);
  const toKey = to.toISOString().slice(0, 10);
  const selectedDayKey = selectedDay?.toISOString().slice(0, 10) ?? null;
  const previousFromKey = previousFrom.toISOString().slice(0, 10);
  const previousToKey = previousTo.toISOString().slice(0, 10);
  const ledger = allLedger.filter((row) => row.date >= fromKey && row.date <= toKey);
  const previousLedger = allLedger.filter(
    (row) => row.date >= previousFromKey && row.date <= previousToKey,
  );
  const previousActorTotals = new Map<string, RevenueBucket>();
  for (const row of previousLedger) {
    const totals = previousActorTotals.get(row.actorId) ?? emptyRevenueBucket();
    totals.costUsd += row.directCostUsd ?? 0;
    totals.allocatedCostUsd += row.allocatedCostUsd ?? 0;
    totals.revenueUsd += row.revenueUsd ?? 0;
    totals.profitUsd += row.profitUsd ?? 0;
    totals.netProfitUsd += row.netProfitUsd ?? 0;
    totals.runs += row.runs;
    totals.successfulRuns += row.successfulRuns;
    totals.failedRuns += row.failedRuns;
    totals.results += row.results;
    totals.activeUsers += row.activeUsers ?? 0;
    totals.costCoveredDays += row.directCostUsd == null ? 0 : 1;
    totals.allocatedCoveredDays += row.allocatedCostUsd == null ? 0 : 1;
    totals.revenueCoveredDays += row.revenueUsd == null ? 0 : 1;
    totals.activeUsersCoveredDays += row.activeUsers == null ? 0 : 1;
    previousActorTotals.set(row.actorId, totals);
  }
  const actorTotals = new Map<string, RevenueBucket>();
  const actorDayCounts = new Map<string, number>();
  const actorsWithMonetization = new Set<string>();
  for (const row of ledger) {
    const daily = dailyRevenue.get(row.date) ?? emptyRevenueBucket();
    const week = utcWeekStartKey(row.date);
    const weekly = weeklyRevenue.get(week) ?? emptyRevenueBucket();
    const monthly = monthlyRevenue.get(row.date.slice(0, 7)) ?? emptyRevenueBucket();
    const actor = actorTotals.get(row.actorId) ?? emptyRevenueBucket();
    for (const bucket of [daily, weekly, monthly, actor]) {
      bucket.costUsd += row.directCostUsd ?? 0;
      bucket.allocatedCostUsd += row.allocatedCostUsd ?? 0;
      bucket.revenueUsd += row.revenueUsd ?? 0;
      bucket.profitUsd += row.profitUsd ?? 0;
      bucket.netProfitUsd += row.netProfitUsd ?? 0;
      bucket.runs += row.runs;
      bucket.successfulRuns += row.successfulRuns;
      bucket.failedRuns += row.failedRuns;
      bucket.results += row.results;
      bucket.activeUsers += row.activeUsers ?? 0;
      bucket.costCoveredDays += row.directCostUsd == null ? 0 : 1;
      bucket.allocatedCoveredDays += row.allocatedCostUsd == null ? 0 : 1;
      bucket.revenueCoveredDays += row.revenueUsd == null ? 0 : 1;
      bucket.activeUsersCoveredDays += row.activeUsers == null ? 0 : 1;
    }
    if (row.revenueUsd != null) actorsWithMonetization.add(row.actorId);
    dailyRevenue.set(row.date, daily);
    weeklyRevenue.set(week, weekly);
    monthlyRevenue.set(row.date.slice(0, 7), monthly);
    actorTotals.set(row.actorId, actor);
    actorDayCounts.set(row.actorId, (actorDayCounts.get(row.actorId) ?? 0) + 1);
  }
  if (requestedActorIds.length) {
    for (const actorId of selectedActorIds) {
      if (actorsById.has(actorId) && !actorTotals.has(actorId)) {
        actorTotals.set(actorId, emptyRevenueBucket());
      }
    }
  }
  const revenueActors = [...actorTotals]
    .flatMap(([actorId, totals]) => {
      const actor = actorsById.get(actorId);
      if (!actor) return [];
      const actorDayCount = actorDayCounts.get(actorId) ?? 0;
      const costCoverageComplete = actorDayCount > 0 && totals.costCoveredDays === actorDayCount;
      const allocatedCoverageComplete =
        actorDayCount > 0 && totals.allocatedCoveredDays === actorDayCount;
      const previous = previousActorTotals.get(actorId) ?? emptyRevenueBucket();
      return [
        {
          ...totals,
          id: actor.id,
          apifyActorId: actor.apifyActorId,
          title: actor.title,
          actorName: actor.actorName,
          username: actor.username,
          previousRevenueUsd: previous.revenueUsd,
          previousNetProfitUsd: previous.netProfitUsd,
          previousRuns: previous.runs,
          previousResults: previous.results,
          actorDays: actorDayCount,
          costCoveredDays: totals.costCoveredDays,
          allocatedCoveredDays: totals.allocatedCoveredDays,
          revenueCoveredDays: totals.revenueCoveredDays,
          activeUsersCoveredDays: totals.activeUsersCoveredDays,
          costAvailable: costCoverageComplete,
          allocatedCostAvailable: allocatedCoverageComplete,
          margin:
            allocatedCoverageComplete && totals.revenueUsd > 0
              ? (totals.netProfitUsd / totals.revenueUsd) * 100
              : null,
        },
      ];
    })
    .filter(
      (actor) =>
        requestedActorIds.length > 0 ||
        actor.costUsd !== 0 ||
        actor.revenueUsd !== 0 ||
        actor.profitUsd !== 0 ||
        actor.runs !== 0 ||
        actor.results !== 0,
    )
    .sort((left, right) => right.revenueUsd - left.revenueUsd || right.profitUsd - left.profitUsd);
  const hasCachedOwnerMonetization =
    ownerMonetization?.month === currentRevenueMonth &&
    Number(ownerMonetization.coveredActors ?? 0) > 0;
  const comparisonTotals = (rows: LedgerRow[]) => {
    const totals = emptyRevenueBucket();
    for (const row of rows) {
      totals.costUsd += row.directCostUsd ?? 0;
      totals.allocatedCostUsd += row.allocatedCostUsd ?? 0;
      totals.revenueUsd += row.revenueUsd ?? 0;
      totals.profitUsd += row.profitUsd ?? 0;
      totals.netProfitUsd += row.netProfitUsd ?? 0;
      totals.runs += row.runs;
      totals.successfulRuns += row.successfulRuns;
      totals.failedRuns += row.failedRuns;
      totals.results += row.results;
      totals.activeUsers += row.activeUsers ?? 0;
      totals.costCoveredDays += row.directCostUsd == null ? 0 : 1;
      totals.allocatedCoveredDays += row.allocatedCostUsd == null ? 0 : 1;
      totals.revenueCoveredDays += row.revenueUsd == null ? 0 : 1;
      totals.activeUsersCoveredDays += row.activeUsers == null ? 0 : 1;
    }
    return totals;
  };
  const previousTotals = comparisonTotals(previousLedger);
  const currentTotals = comparisonTotals(ledger);
  const usageSeries = new Map<
    string,
    { usageCostUsd: number; runs: number; successfulRuns: number; failedRuns: number }
  >();
  for (const actor of actors) {
    if (!selectedActorIdSet.has(actor.id)) continue;
    for (const item of actor.usageDaily) {
      const day = item.date.toISOString().slice(0, 10);
      if (day < fromKey || day > toKey) continue;
      const key = financialPeriodKey(day, granularity);
      const point = usageSeries.get(key) ?? {
        usageCostUsd: 0,
        runs: 0,
        successfulRuns: 0,
        failedRuns: 0,
      };
      point.usageCostUsd += Number(item.usageCostUsd);
      point.runs += item.runs;
      point.successfulRuns += item.successfulRuns;
      point.failedRuns += item.failedRuns;
      usageSeries.set(key, point);
    }
  }
  const revenueSeries =
    granularity === "day" ? dailyRevenue : granularity === "week" ? weeklyRevenue : monthlyRevenue;
  let cumulativeUsage = 0;
  let cumulativeRevenue = 0;
  let cumulativeProfit = 0;
  let cumulativeAllocatedCost = 0;
  let cumulativeNetProfit = 0;
  let cumulativeRuns = 0;
  let cumulativeSuccessfulRuns = 0;
  let cumulativeFailedRuns = 0;
  const reportPoints = [...new Set([...usageSeries.keys(), ...revenueSeries.keys()])]
    .sort()
    .map((period) => {
      const usage = usageSeries.get(period);
      const monetization = revenueSeries.get(period);
      // The ledger merges owner analytics with run-level billing per
      // Actor-day. Prefer that complete series over the sparse
      // UsageDaily aggregate whenever it has coverage for this period.
      const usageCostUsd = monetization?.costCoveredDays
        ? monetization.costUsd
        : (usage?.usageCostUsd ?? 0);
      const revenueUsd = monetization?.revenueUsd ?? 0;
      const profitUsd = monetization?.profitUsd ?? revenueUsd - usageCostUsd;
      const allocatedCostUsd = monetization?.allocatedCoveredDays
        ? monetization.allocatedCostUsd
        : usageCostUsd;
      const netProfitUsd = monetization?.netProfitUsd ?? revenueUsd - allocatedCostUsd;
      const runs = monetization?.runs ?? usage?.runs ?? 0;
      const successfulRuns = monetization?.successfulRuns ?? usage?.successfulRuns ?? 0;
      const failedRuns = monetization?.failedRuns ?? usage?.failedRuns ?? 0;
      cumulativeUsage += usageCostUsd;
      cumulativeRevenue += revenueUsd;
      cumulativeProfit += profitUsd;
      cumulativeAllocatedCost += allocatedCostUsd;
      cumulativeNetProfit += netProfitUsd;
      cumulativeRuns += runs;
      cumulativeSuccessfulRuns += successfulRuns;
      cumulativeFailedRuns += failedRuns;
      return {
        period,
        usageCostUsd: mode === "cumulative" ? cumulativeUsage : usageCostUsd,
        revenueUsd: mode === "cumulative" ? cumulativeRevenue : revenueUsd,
        profitUsd: mode === "cumulative" ? cumulativeProfit : profitUsd,
        allocatedCostUsd: mode === "cumulative" ? cumulativeAllocatedCost : allocatedCostUsd,
        netProfitUsd: mode === "cumulative" ? cumulativeNetProfit : netProfitUsd,
        runs: mode === "cumulative" ? cumulativeRuns : runs,
        successfulRuns: mode === "cumulative" ? cumulativeSuccessfulRuns : successfulRuns,
        failedRuns: mode === "cumulative" ? cumulativeFailedRuns : failedRuns,
      };
    });
  // The all-Actor report can contain tens of thousands of Actor-day rows.
  // Summary metrics and per-Actor totals still use the complete ledger, but
  // the initial response carries only a recent preview. Selecting Actors
  // raises the detail limit so normal filtered exports remain complete.
  const weeklyLedger = () => {
    const grouped = new Map<string, LedgerRow>();
    for (const row of ledger) {
      const week = utcWeekStartKey(row.date);
      const key = `${row.actorId}:${week}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { ...row, date: week });
        continue;
      }
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
      current.profitUsd =
        current.profitUsd == null || row.profitUsd == null
          ? null
          : current.profitUsd + row.profitUsd;
      current.netProfitUsd =
        current.netProfitUsd == null || row.netProfitUsd == null
          ? null
          : current.netProfitUsd + row.netProfitUsd;
      current.runs += row.runs;
      current.successfulRuns += row.successfulRuns;
      current.failedRuns += row.failedRuns;
      current.results += row.results;
      current.activeUsers =
        current.activeUsers == null || row.activeUsers == null
          ? null
          : current.activeUsers + row.activeUsers;
      current.margin =
        current.revenueUsd && current.netProfitUsd != null
          ? (current.netProfitUsd / current.revenueUsd) * 100
          : null;
      if (row.capturedAt && (!current.capturedAt || row.capturedAt > current.capturedAt)) {
        current.capturedAt = row.capturedAt;
      }
    }
    return [...grouped.values()].sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.actorName.localeCompare(right.actorName),
    );
  };
  const scopedLedger = selectedDayKey
    ? ledger.filter((row) => row.date === selectedDayKey)
    : tableGrouping === "weekly"
      ? weeklyLedger()
      : ledger;
  // A day drill-down is explicitly requested as a complete Actor breakdown.
  // The broad range preview remains capped so cached-first page loads stay small.
  const ledgerResponseLimit = selectedDayKey
    ? Number.POSITIVE_INFINITY
    : tableGrouping === "weekly"
      ? 5_000
      : requestedActorIds.length
        ? 5_000
        : 250;
  const ledgerTruncated = scopedLedger.length > ledgerResponseLimit;
  const responseLedger = ledgerTruncated ? scopedLedger.slice(-ledgerResponseLimit) : scopedLedger;
  const responseRequestId = requestId;
  const responseSyncedAt =
    latestSyncAt?.toISOString() ?? accountUsage?.syncedAt ?? revenueSyncedAt?.toISOString() ?? null;
  const responseMeta = {
    cached: Boolean(accountUsage) || actors.length > 0,
    stale: accountUsageValue === CACHE_MISS,
    syncedAt: responseSyncedAt,
    requestId: responseRequestId,
    retryAfterSeconds: null,
  };
  return {
    ok: true,
    meta: responseMeta,
    data: {
      meta: responseMeta,
      items: actors,
      latestSyncAt,
      accountUsage,
      accountDailyCosts: [...accountDailyCosts].map(([date, usageCostUsd]) => ({
        date,
        usageCostUsd,
      })),
      filters: {
        from: fromKey,
        to: toKey,
        previousFrom: previousFromKey,
        previousTo: previousToKey,
        actorIds: requestedActorIds,
        granularity,
        mode,
        day: selectedDayKey,
        timeZone: "UTC",
      },
      report: { granularity, mode, points: reportPoints },
      revenue: {
        syncedAt: revenueSyncedAt?.toISOString() ?? null,
        daily: [...dailyRevenue].map(([date, value]) => ({ date, ...value })),
        monthly: [...monthlyRevenue].map(([month, value]) => ({ month, ...value })),
        currentMonth: currentRevenueMonth,
        actors: revenueActors,
        ledger: responseLedger,
        ledgerTotal: scopedLedger.length,
        ledgerTruncated,
        comparison: { current: currentTotals, previous: previousTotals },
        coverage: {
          workspaceActors: actors.length,
          selectedActors: selectedActorIds.length,
          actorsWithRevenue: actorsWithMonetization.size,
          rows: ledger.length,
          costCoveredRows: currentTotals.costCoveredDays,
          allocatedCostCoveredRows: currentTotals.allocatedCoveredDays,
          revenueCoveredRows: currentTotals.revenueCoveredDays,
          activeUsersCoveredRows: currentTotals.activeUsersCoveredDays,
          failedActorSyncs: actors.filter(
            (actor) => actor.insightSyncStatus === "UNAVAILABLE" || actor.insightSyncError,
          ).length,
          officialCurrentMonthCoveredActors:
            ownerMonetization?.month === currentRevenueMonth
              ? Number(ownerMonetization.coveredActors ?? 0)
              : 0,
        },
        unavailableActors: hasCachedOwnerMonetization
          ? Math.max(0, ownerMonetization.failedActors ?? 0)
          : Math.max(0, selectedActorIds.length - actorsWithMonetization.size),
      },
    },
  };
}
