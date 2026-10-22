import { db, Prisma } from "@actorconsole/db";
import {
  toApifyClientError,
  type ApifyClientWrapper,
  ApifyActorAcquisition,
  ApifyActorAnalytics,
  ApifyActorQuality,
} from "@actorconsole/apify";

const DAY = /^\d{4}-\d{2}-\d{2}/;
const ACTIVE_KEYS = new Set([
  "activeusers",
  "activeusercount",
  "monthlyusers",
  "users30days",
  "usercount",
  "uniqusers",
]);
const ACTIVE_COMPONENT_KEYS = new Set(["freeusers", "payingusers"]);
const TOTAL_KEYS = new Set(["totalusers", "totalusercount", "cumulativeusers", "allusers"]);

type Counts = { activeUsers?: number; totalUsers?: number };

export interface ActorInsightRow {
  capturedOn: Date;
  periodStart: Date;
  syncStatus: string;
  totalRuns?: number;
  succeededRuns?: number;
  failedRuns?: number;
  abortedRuns?: number;
  timedOutRuns?: number;
  resultCount?: number;
  successRate?: number;
  activeUsers?: number;
  totalUsers?: number;
  uniqueStoreViewers?: number;
  consolePageViews?: number;
  usersWithRun?: number;
  costUsd?: number;
  revenueUsd?: number;
  profitUsd?: number;
  profitMargin?: number;
  qualityScore?: number;
  qualityPercentile?: number;
  runStatistics?: unknown;
  userStatistics?: unknown;
  acquisition?: unknown;
  monetization?: unknown;
  quality?: unknown;
  errors?: unknown;
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function key(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function values(record: Record<string, unknown>, keys: Set<string>): number[] {
  return Object.entries(record)
    .filter(([name]) => keys.has(key(name)))
    .map(([, value]) => number(value))
    .filter((value): value is number => value !== undefined);
}

/** Console has changed this payload shape; recursively retain every dated count. */
export function extractInsightUserDays(value: unknown): Map<string, Counts> {
  const days = new Map<string, Counts>();
  const visit = (node: unknown, context = "", depth = 0) => {
    if (depth > 7 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, context, depth + 1));
      return;
    }
    const record = node as Record<string, unknown>;
    const recordDate = ["date", "day", "timestamp", "createdAt", "capturedAt"]
      .map((name) => record[name])
      .find((item): item is string => typeof item === "string" && DAY.test(item));
    if (recordDate) merge(recordDate.slice(0, 10), record, context);
    for (const [name, child] of Object.entries(record)) {
      if (DAY.test(name) && child && typeof child === "object" && !Array.isArray(child)) {
        merge(name.slice(0, 10), child as Record<string, unknown>, context);
      }
      visit(child, `${context}.${key(name)}`, depth + 1);
    }
  };
  const merge = (date: string, record: Record<string, unknown>, context: string) => {
    const active = values(record, ACTIVE_KEYS);
    const activeComponents = values(record, ACTIVE_COMPONENT_KEYS);
    const total = values(record, TOTAL_KEYS);
    const contextual = context.includes("user")
      ? number(record.value ?? record.count ?? record.y)
      : undefined;
    if (!active.length && !activeComponents.length && !total.length && contextual === undefined)
      return;
    const previous = days.get(date) ?? {};
    days.set(date, {
      ...previous,
      ...(active.length || activeComponents.length || contextual !== undefined
        ? {
            activeUsers: active.length
              ? Math.max(...active)
              : activeComponents.length
                ? activeComponents.reduce((sum, value) => sum + value, 0)
                : contextual,
          }
        : {}),
      ...(total.length ? { totalUsers: Math.max(...total) } : {}),
    });
  };
  visit(value);
  return days;
}

function utcDay(value: string | Date): Date {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : value;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function monthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function insightMonths(now = new Date(), count = 3): string[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
      .toISOString()
      .slice(0, 10),
  );
}

export function buildActorInsightRows(input: {
  analytics: ApifyActorAnalytics[];
  acquisition?: ApifyActorAcquisition;
  acquisitions?: ApifyActorAcquisition[];
  quality?: ApifyActorQuality;
  now?: Date;
  syncStatus: string;
  errors?: string[];
}): ActorInsightRow[] {
  const now = input.now ?? new Date();
  const acquisitions = input.acquisitions ?? (input.acquisition ? [input.acquisition] : []);
  const rows = new Map<string, ActorInsightRow>();
  for (const analytics of input.analytics) {
    const userDays = extractInsightUserDays(analytics.userCountStatistics);
    const dates = new Set([
      ...Object.keys(analytics.runStatistics.dailyStats ?? {}),
      ...userDays.keys(),
      ...Object.keys(analytics.profitMargin.dailyProfitMarginStats ?? {}),
      ...Object.keys(analytics.costsPerThousandResults.dailyActorRunsCost ?? {}),
    ]);
    for (const date of dates) {
      const capturedOn = utcDay(date);
      const runs = analytics.runStatistics.dailyStats?.[date] ?? {};
      // Apify's Monetization dashboard only recognizes paying-user activity as
      // creator revenue and cost. Free-user runs still belong in the run and
      // result series, but must not inflate the financial totals.
      const profit = analytics.profitMargin.dailyProfitMarginStats?.[date]?.payingUsersUsd;
      const users = userDays.get(date);
      const totalRuns = number(runs.TOTAL);
      rows.set(date, {
        capturedOn,
        periodStart: monthStart(capturedOn),
        syncStatus: input.syncStatus,
        totalRuns,
        succeededRuns: number(runs.SUCCEEDED),
        failedRuns: number(runs.FAILED),
        abortedRuns: number(runs.ABORTED),
        timedOutRuns: number(runs["TIMED-OUT"]),
        resultCount: number(runs.RESULTS),
        ...(totalRuns ? { successRate: (number(runs.SUCCEEDED) ?? 0) / totalRuns } : {}),
        ...users,
        // All-run costs have a different scope. Never substitute them into a
        // paying-user financial row when its cost is unknown.
        costUsd: profit
          ? profit.costUsd
          : analytics.costsPerThousandResults.dailyActorRunsCost?.[date],
        revenueUsd: profit?.revenueUsd,
        profitUsd: profit?.profitUsd,
        profitMargin: profit?.margin,
        runStatistics: {
          daily: runs,
          runsSummary: analytics.runStatistics.runsSummary,
          resultsSummary: analytics.runStatistics.resultsSummary,
        },
        userStatistics: users,
        monetization: {
          daily: profit,
          totalProfitMarginStats: analytics.profitMargin.totalProfitMarginStats,
          actorBreakdown: analytics.actorBreakdown,
        },
      });
    }
  }
  const today = now.toISOString().slice(0, 10);
  const currentAcquisition = acquisitions.find(
    (item) => item.monthStartAt.slice(0, 7) === today.slice(0, 7),
  );
  const current = rows.get(today) ?? {
    capturedOn: utcDay(now),
    periodStart: monthStart(now),
    syncStatus: input.syncStatus,
  };
  rows.set(today, {
    ...current,
    syncStatus: input.syncStatus,
    uniqueStoreViewers: currentAcquisition?.numUniqueViewingUsers,
    consolePageViews: currentAcquisition?.numUniqueConsolePageViews,
    usersWithRun: currentAcquisition?.numUniqueUsersWithRun,
    qualityScore: input.quality?.scores?.actorQuality,
    qualityPercentile: input.quality?.scores?.actorQualityPercentile,
    acquisition: acquisitions.length ? { periods: acquisitions } : undefined,
    quality: input.quality,
    errors: input.errors?.length ? input.errors : undefined,
  });
  return [...rows.values()].sort(
    (left, right) => left.capturedOn.getTime() - right.capturedOn.getTime(),
  );
}

function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function syncActorInsights(input: {
  actor: { id: string; apifyActorId: string };
  apify: ApifyClientWrapper;
  bootstrap?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const months = insightMonths(now, input.bootstrap ? 3 : 1);
  const analyticsResults = await Promise.allSettled(
    months.map((month) => input.apify.getActorAnalytics([input.actor.apifyActorId], month)),
  );
  const acquisitionMonths = insightMonths(now, input.bootstrap ? 3 : 2);
  const [acquisitionResults, qualityResult] = await Promise.all([
    Promise.allSettled(
      acquisitionMonths.map((month) =>
        input.apify.getActorAcquisition(
          [input.actor.apifyActorId],
          new Date(`${month}T00:00:00.000Z`).toISOString(),
        ),
      ),
    ),
    Promise.resolve(input.apify.getActorQuality(input.actor.apifyActorId)).then(
      (value) => ({ status: "fulfilled", value }) as PromiseFulfilledResult<ApifyActorQuality>,
      (reason) => ({ status: "rejected", reason }) as PromiseRejectedResult,
    ),
  ]);
  const analytics = analyticsResults
    .filter(
      (result): result is PromiseFulfilledResult<ApifyActorAnalytics> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
  const rawErrors = [
    ...analytics.flatMap((item) => Object.values(item.errors ?? {})),
    ...analyticsResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => errorMessage(result.reason)),
    ...acquisitionResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => errorMessage(result.reason)),
    ...(qualityResult.status === "rejected" ? [errorMessage(qualityResult.reason)] : []),
  ];
  const errors = Array.from(
    new Set(rawErrors.map((error) => String(error).trim()).filter(Boolean)),
  );
  const fulfilled =
    analytics.length +
    acquisitionResults.filter((result) => result.status === "fulfilled").length +
    Number(qualityResult.status === "fulfilled");
  const expected = analyticsResults.length + acquisitionResults.length + 1;
  const rejectedReasons = [
    ...analyticsResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason),
    ...acquisitionResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason),
    ...(qualityResult.status === "rejected" ? [qualityResult.reason] : []),
  ];
  if (fulfilled === 0) {
    const transient = rejectedReasons
      .map((reason) => toApifyClientError(reason))
      .find((error) => ["network", "rate_limited", "unknown"].includes(error.code));
    if (transient) throw transient;
  }
  const syncStatus =
    fulfilled === 0
      ? "UNAVAILABLE"
      : fulfilled === expected && errors.length === 0
        ? "COMPLETE"
        : "PARTIAL";
  const rows = buildActorInsightRows({
    analytics,
    acquisitions: acquisitionResults
      .filter(
        (result): result is PromiseFulfilledResult<ApifyActorAcquisition> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value),
    quality: qualityResult.status === "fulfilled" ? qualityResult.value : undefined,
    now,
    syncStatus,
    errors,
  });
  await db.$transaction([
    ...rows.map((row) => {
      const data = {
        capturedAt: now,
        periodStart: row.periodStart,
        syncStatus: row.syncStatus,
        totalRuns: row.totalRuns,
        succeededRuns: row.succeededRuns,
        failedRuns: row.failedRuns,
        abortedRuns: row.abortedRuns,
        timedOutRuns: row.timedOutRuns,
        resultCount: row.resultCount,
        successRate: row.successRate,
        activeUsers: row.activeUsers,
        totalUsers: row.totalUsers,
        uniqueStoreViewers: row.uniqueStoreViewers,
        consolePageViews: row.consolePageViews,
        usersWithRun: row.usersWithRun,
        costUsd: row.costUsd,
        revenueUsd: row.revenueUsd,
        profitUsd: row.profitUsd,
        profitMargin: row.profitMargin,
        qualityScore: row.qualityScore,
        qualityPercentile: row.qualityPercentile,
        runStatistics: json(row.runStatistics),
        userStatistics: json(row.userStatistics),
        acquisition: json(row.acquisition),
        monetization: json(row.monetization),
        quality: json(row.quality),
        errors: json(row.errors),
      };
      const update = {
        capturedAt: now,
        periodStart: row.periodStart,
        syncStatus: row.syncStatus,
        ...(row.totalRuns === undefined ? {} : { totalRuns: row.totalRuns }),
        ...(row.succeededRuns === undefined ? {} : { succeededRuns: row.succeededRuns }),
        ...(row.failedRuns === undefined ? {} : { failedRuns: row.failedRuns }),
        ...(row.abortedRuns === undefined ? {} : { abortedRuns: row.abortedRuns }),
        ...(row.timedOutRuns === undefined ? {} : { timedOutRuns: row.timedOutRuns }),
        ...(row.resultCount === undefined ? {} : { resultCount: row.resultCount }),
        ...(row.successRate === undefined ? {} : { successRate: row.successRate }),
        ...(row.activeUsers === undefined ? {} : { activeUsers: row.activeUsers }),
        ...(row.totalUsers === undefined ? {} : { totalUsers: row.totalUsers }),
        ...(row.uniqueStoreViewers === undefined
          ? {}
          : { uniqueStoreViewers: row.uniqueStoreViewers }),
        ...(row.consolePageViews === undefined ? {} : { consolePageViews: row.consolePageViews }),
        ...(row.usersWithRun === undefined ? {} : { usersWithRun: row.usersWithRun }),
        ...(row.costUsd === undefined ? {} : { costUsd: row.costUsd }),
        ...(row.revenueUsd === undefined ? {} : { revenueUsd: row.revenueUsd }),
        ...(row.profitUsd === undefined ? {} : { profitUsd: row.profitUsd }),
        ...(row.profitMargin === undefined ? {} : { profitMargin: row.profitMargin }),
        ...(row.qualityScore === undefined ? {} : { qualityScore: row.qualityScore }),
        ...(row.qualityPercentile === undefined
          ? {}
          : { qualityPercentile: row.qualityPercentile }),
        ...(row.runStatistics === undefined
          ? {}
          : { runStatistics: row.runStatistics as Prisma.InputJsonValue }),
        ...(row.userStatistics === undefined
          ? {}
          : { userStatistics: row.userStatistics as Prisma.InputJsonValue }),
        ...(row.acquisition === undefined
          ? {}
          : { acquisition: row.acquisition as Prisma.InputJsonValue }),
        ...(row.monetization === undefined
          ? {}
          : { monetization: row.monetization as Prisma.InputJsonValue }),
        ...(row.quality === undefined ? {} : { quality: row.quality as Prisma.InputJsonValue }),
        errors: json(row.errors),
      };
      return db.actorInsightSnapshot.upsert({
        where: { actorId_capturedOn: { actorId: input.actor.id, capturedOn: row.capturedOn } },
        create: { actorId: input.actor.id, capturedOn: row.capturedOn, ...data },
        update,
      });
    }),
    db.actor.update({
      where: { id: input.actor.id },
      data: {
        lastInsightSyncAt: now,
        insightSyncStatus: syncStatus,
        insightSyncError: errors.length ? errors.join(" | ").slice(0, 8_000) : null,
      },
    }),
  ]);
  return { syncStatus, rows: rows.length, errors };
}
