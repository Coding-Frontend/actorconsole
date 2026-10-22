import { db } from "@actorconsole/db";
import type { UserSession } from "@actorconsole/shared";
import type {
  DefaultDashboardPayload,
  EarningsSummary,
} from "@actorconsole/shared/default-dashboard";
import { AppError } from "../middleware/error.js";
import { dateQuery } from "./query.js";
import { loadWorkspaceFinancialReport } from "./financial-report.js";

type WorkspaceReport = Awaited<ReturnType<typeof loadWorkspaceFinancialReport>>["data"];
const DAY_MS = 86_400_000;

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function total(rows: EarningsSummary[]): EarningsSummary {
  const revenueUsd = sumKnown(rows.map((row) => row.revenueUsd));
  const usageCostUsd = sumKnown(rows.map((row) => row.usageCostUsd));
  return {
    revenueUsd,
    usageCostUsd,
    earningsUsd: sumKnown(rows.map((row) => row.earningsUsd)),
    runs: rows.reduce((sum, row) => sum + row.runs, 0),
  };
}

function billingRevenue(report: WorkspaceReport, month: string): number | null {
  const owner = report.accountUsage?.ownerMonetization as
    | {
        month?: string;
        actors?: Array<{ earningsStats?: { totalRevenueUsd?: number } }>;
      }
    | undefined;
  if (owner?.month !== month || !Array.isArray(owner.actors)) return null;
  return sumKnown(
    owner.actors.map((actor) => {
      const value = actor.earningsStats?.totalRevenueUsd;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }),
  );
}

export async function loadDefaultDashboard(
  session: UserSession,
  params: { from?: string; to?: string },
): Promise<DefaultDashboardPayload> {
  // An API key remains bound to its workspace even when the owner has several.
  if (session.authMethod === "api-key")
    throw new AppError(
      "interactive_session_required",
      "Use an account session to view All Workspaces",
      403,
    );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const from = dateQuery(params.from, "from") ?? new Date(today.getTime() - 29 * DAY_MS);
  const to = dateQuery(params.to, "to") ?? today;
  if (from > to || (to.getTime() - from.getTime()) / DAY_MS >= 370)
    throw new AppError("invalid_query", "Choose a date range of 1 to 370 days", 400);
  const fromKey = from.toISOString().slice(0, 10);
  const toKey = to.toISOString().slice(0, 10);
  const billingMonth = today.toISOString().slice(0, 7);
  const profiles = await db.businessProfile.findMany({
    where: { userId: session.userId },
    select: { id: true, name: true, plan: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (profiles.length < 2)
    throw new AppError(
      "default_unavailable",
      "All Workspaces is available when you have multiple workspaces",
      409,
    );

  const reports = new Map<string, WorkspaceReport | null>();
  // Keep database concurrency bounded without ever changing the caller's active workspace.
  for (let index = 0; index < profiles.length; index += 4) {
    const batch = profiles.slice(index, index + 4);
    const results = await Promise.allSettled(
      batch.map((profile) =>
        loadWorkspaceFinancialReport({
          session: { ...session, businessProfileId: profile.id, plan: profile.plan },
          query: (key) => (key === "from" ? fromKey : key === "to" ? toKey : undefined),
        }),
      ),
    );
    results.forEach((result, offset) => {
      reports.set(batch[offset]!.id, result.status === "fulfilled" ? result.value.data : null);
    });
  }
  if ([...reports.values()].every((report) => report === null))
    throw new AppError(
      "financial_data_unavailable",
      "Could not load workspace earnings. Try again.",
      503,
    );

  const dates: string[] = [];
  for (let day = from.getTime(); day <= to.getTime(); day += DAY_MS)
    dates.push(new Date(day).toISOString().slice(0, 10));
  const dailyByWorkspace = new Map<string, Map<string, EarningsSummary>>();
  const workspaces = profiles.map((profile) => {
    const report = reports.get(profile.id);
    const revenueDays = new Map(report?.revenue.daily.map((row) => [row.date, row]) ?? []);
    const accountCosts = new Map(
      report?.accountDailyCosts.map((row) => [row.date, row.usageCostUsd]) ?? [],
    );
    const days = new Map<string, EarningsSummary>();
    for (const date of dates) {
      const row = revenueDays.get(date);
      const revenueUsd = row?.revenueCoveredDays ? row.revenueUsd : null;
      const usageCostUsd = accountCosts.get(date) ?? (row?.costCoveredDays ? row.costUsd : null);
      days.set(date, {
        revenueUsd,
        usageCostUsd,
        earningsUsd:
          revenueUsd !== null && usageCostUsd !== null ? revenueUsd - usageCostUsd : null,
        runs: row?.runs ?? 0,
      });
    }
    dailyByWorkspace.set(profile.id, days);
    const summary = total([...days.values()]);
    return {
      id: profile.id,
      name: profile.name,
      ...summary,
      currentBillingRevenueUsd: report ? billingRevenue(report, billingMonth) : null,
      syncedAt: typeof report?.meta.syncedAt === "string" ? report.meta.syncedAt : null,
      revenueAvailable: summary.revenueUsd !== null,
      usageAvailable: summary.usageCostUsd !== null,
      partial:
        !report ||
        summary.revenueUsd === null ||
        summary.usageCostUsd === null ||
        report.revenue.unavailableActors > 0 ||
        report.revenue.coverage.failedActorSyncs > 0 ||
        report.revenue.coverage.revenueCoveredRows < report.revenue.coverage.rows ||
        report.revenue.coverage.costCoveredRows < report.revenue.coverage.rows,
    };
  });
  const daily = dates.map((date) => {
    const rows = [...dailyByWorkspace.values()].map((days) => days.get(date)!);
    return {
      date,
      ...total(rows),
      workspacesCovered: rows.filter((row) => row.revenueUsd !== null || row.usageCostUsd !== null)
        .length,
    };
  });
  return {
    from: fromKey,
    to: toKey,
    timeZone: "UTC",
    billingMonth,
    currentBillingRevenueUsd: sumKnown(
      workspaces.map((workspace) => workspace.currentBillingRevenueUsd),
    ),
    billingWorkspacesCovered: workspaces.filter(
      (workspace) => workspace.currentBillingRevenueUsd !== null,
    ).length,
    summary: total(workspaces),
    daily,
    workspaces,
    partial: workspaces.some((workspace) => workspace.partial),
  };
}
