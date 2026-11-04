import { randomUUID } from "node:crypto";
import { BoundedTtlCache, type UserSession } from "@actorconsole/shared";
import {
  financialTableRows,
  sortFinancialRows,
  usageActorTotalRows,
  type FinancialTableRow,
  type UsageCostsPayload,
} from "@actorconsole/shared/financial-report";
import { loadWorkspaceFinancialReport } from "./financial-report.js";
import { enumQuery, integerQuery, stringQuery } from "./query.js";

type Kind = "usage" | "costs" | "revenue";
type Options = {
  session: UserSession;
  kind: Kind;
  query: (key: string) => string | undefined;
  requestId?: string | null;
};
type Snapshot = { scope: string; criteria: string; rows: FinancialTableRow[] };
// Only table rows are retained, never credentials or raw history. Pagination
// reuses the summary's exact calculation for two minutes, with a hard memory
// bound. A miss (including another API replica) simply rebuilds from the DB.
const snapshots = new BoundedTtlCache<Snapshot>(16, 50_000, (value) => value.rows.length + 1);
const filterKeys = [
  "from",
  "to",
  "actorIds",
  "apifyActorId",
  "granularity",
  "mode",
  "compare",
  "day",
  "table",
];

function scope(options: Options) {
  const { session } = options;
  return JSON.stringify([
    session.userId,
    session.businessProfileId ?? null,
    session.authMethod ?? null,
    session.apiKeyId ?? null,
    [...(session.apiKeyActorIds ?? [])].sort(),
    options.kind,
  ]);
}

function criteria(query: Options["query"]) {
  const params = new URLSearchParams();
  for (const key of filterKeys) {
    const value = query(key);
    if (value !== undefined) params.set(key, value);
  }
  return params.toString();
}

async function prepare(options: Options) {
  const report = await loadWorkspaceFinancialReport({
    ...options,
    fullLedger: true,
    focus: options.kind,
  });
  const data = report.data as unknown as UsageCostsPayload;
  const table = data.filters?.day
    ? "daily"
    : options.kind === "revenue"
      ? "total"
      : options.query("table") === "weekly"
        ? "weekly"
        : options.query("table") === "daily"
          ? "daily"
          : "total";
  const rows = financialTableRows(data, options.kind, table);
  const snapshotId = randomUUID();
  const snapshot = { scope: scope(options), criteria: criteria(options.query), rows };
  snapshots.set(snapshotId, snapshot, 120_000);
  const usageTotals = usageActorTotalRows(data).reduce(
    (sum, row) => ({
      runs: sum.runs + row.runs,
      successful: sum.successful + row.successfulRuns,
      failed: sum.failed + row.failedRuns,
      results: sum.results + row.results,
      users: sum.users + (row.activeUsers ?? 0),
    }),
    { runs: 0, successful: 0, failed: 0, results: 0, users: 0 },
  );
  const account = data.accountUsage;
  // Costs needs the billing cycle and service breakdown. Usage needs none of
  // the account billing payload, and Revenue only needs its synchronization state.
  const accountUsage =
    !account || options.kind === "usage"
      ? null
      : {
          syncedAt: account.syncedAt,
          unavailable: account.unavailable,
          credentialIssue: account.credentialIssue,
          monthly: null,
          actors: { current: null, previous: null },
          calendarMonth:
            options.kind === "costs" && account.calendarMonth
              ? {
                  monthlyServiceUsage: account.calendarMonth.monthlyServiceUsage,
                  dailyServiceUsage: Object.fromEntries(
                    Object.entries(account.calendarMonth.dailyServiceUsage).map(
                      ([date, services]) => [
                        date,
                        [
                          {
                            quantity: 0,
                            baseUnitPriceUsd: 0,
                            baseAmountUsd: services.reduce(
                              (sum, service) =>
                                sum +
                                Number(
                                  service.amountAfterVolumeDiscountUsd ??
                                    service.baseAmountUsd ??
                                    0,
                                ),
                              0,
                            ),
                          },
                        ],
                      ],
                    ),
                  ),
                }
              : null,
          currentServices: options.kind === "costs" ? account.currentServices : null,
          currentPeriod:
            options.kind === "costs" && account.currentPeriod
              ? {
                  limits: account.currentPeriod.limits,
                  usage: account.currentPeriod.usage
                    ? { ...account.currentPeriod.usage, dailyServiceUsages: [] }
                    : null,
                }
              : undefined,
        };
  const summary: UsageCostsPayload = {
    meta: data.meta,
    latestSyncAt: data.latestSyncAt,
    filters: data.filters,
    report: data.report,
    details: {
      snapshotId,
      query: snapshot.criteria,
      workspaceId: options.session.businessProfileId ?? null,
    },
    usageTotals,
    items: data.items.map((actor) => ({ ...actor, usageDaily: [] })),
    accountUsage,
    revenue: data.revenue
      ? { ...data.revenue, daily: [], monthly: [], actors: [], ledger: [], ledgerTruncated: false }
      : null,
  };
  return { report: { ...report, data: summary }, snapshot, snapshotId };
}

/** Small summary response; the details are fetched only after it has rendered. */
export async function loadFinancialDashboardSummary(options: Options) {
  return (await prepare(options)).report;
}

/** Search and sorting apply before pagination, across the complete history. */
export async function loadFinancialDashboardTable(options: Options) {
  const page = integerQuery(options.query("page"), {
    name: "page",
    defaultValue: 1,
    max: 1_000_000,
  });
  const pageSize = integerQuery(options.query("pageSize"), {
    name: "pageSize",
    defaultValue: 25,
    max: 500,
  });
  const search = stringQuery(options.query("q"), "q", 200) ?? "";
  const sort =
    enumQuery(options.query("sort"), "sort", [
      "name",
      "date",
      "runs",
      "success",
      "failed",
      "results",
      "users",
      "direct",
      "allocated",
      "revenue",
      "profit",
      "margin",
      "share",
    ] as const) ??
    (options.kind === "usage" ? "runs" : options.kind === "costs" ? "direct" : "revenue");
  const direction =
    enumQuery(options.query("direction"), "direction", ["asc", "desc"] as const) ?? "desc";
  let snapshotId = options.query("snapshotId") ?? "";
  let snapshot = snapshots.get(snapshotId);
  if (
    !snapshot ||
    snapshot.scope !== scope(options) ||
    snapshot.criteria !== criteria(options.query)
  ) {
    ({ snapshot, snapshotId } = await prepare(options));
  }
  const rows = sortFinancialRows(snapshot.rows, search, sort, direction);
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  return {
    ok: true,
    data: {
      items: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
      total: rows.length,
      page: safePage,
      pageSize,
      snapshotId,
    },
  };
}
