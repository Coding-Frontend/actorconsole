import { Prisma } from "@actorconsole/db";
import { AppError } from "../middleware/error.js";

const DAY = 86400000;

export function profitabilityRange(from?: string, to?: string, now = new Date()) {
  from ??= new Date(now.getTime() - 29 * DAY).toISOString().slice(0, 10);
  to ??= now.toISOString().slice(0, 10);
  const valid = (date: string) => {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    );
  };
  const days = (Date.parse(to) - Date.parse(from)) / DAY + 1;
  if (!valid(from) || !valid(to) || days < 1 || days > 366)
    throw new AppError("INVALID_DATE", "Choose valid UTC dates covering at most 366 days.", 400);
  return {
    from,
    to,
    days,
    since: new Date(`${from}T00:00:00.000Z`),
    until: new Date(Date.parse(to) + DAY),
  };
}

interface Snapshot {
  capturedOn: Date;
  revenueUsd: number | null;
  costUsd: number | null;
  monetization?: unknown;
}
interface Expense {
  incurredAt: Date;
  amountUsd: { toString(): string } | number | string;
}
const financial = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const sum = (values: (number | string)[]) =>
  values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));

export function calculateProfitability(
  snapshots: Snapshot[],
  expenses: Expense[],
  range: ReturnType<typeof profitabilityRange>,
) {
  // One financial value per UTC day; missing amounts remain unknown, including missing cost.
  const byDay = new Map<string, { revenue: number | null; cost: number | null }>();
  for (const row of snapshots) {
    if (row.capturedOn < range.since || row.capturedOn >= range.until) continue;
    const day = row.capturedOn.toISOString().slice(0, 10);
    const metadata = row.monetization as { daily?: unknown } | null | undefined;
    const daily = metadata?.daily;
    // Read the original paying-user amounts when available. A legacy snapshot may
    // have substituted all-run cost when the paying-user cost was missing.
    const amounts = daily && typeof daily === "object" ? (daily as Record<string, unknown>) : null;
    byDay.set(day, {
      revenue: financial(amounts ? amounts.revenueUsd : row.revenueUsd),
      cost: financial(amounts ? amounts.costUsd : row.costUsd),
    });
  }
  const rows = [...byDay.values()];
  const revenue = rows.flatMap((row) => (row.revenue == null ? [] : [row.revenue]));
  const cost = rows.flatMap((row) => (row.cost == null ? [] : [row.cost]));
  const matched = [...byDay].filter(([, row]) => row.revenue != null && row.cost != null);
  const coveredDates = matched.map(([day]) => day).sort();
  const covered = new Set(coveredDates);
  const recorded = expenses.filter(
    (row) => row.incurredAt >= range.since && row.incurredAt < range.until,
  );
  const matchedExpenses = recorded.filter((row) =>
    covered.has(row.incurredAt.toISOString().slice(0, 10)),
  );
  const external = sum(recorded.map((row) => row.amountUsd.toString()));
  const profitRevenue = sum(matched.map(([, row]) => row.revenue!));
  const profitCost = sum(matched.map(([, row]) => row.cost!));
  const profitExternal = sum(matchedExpenses.map((row) => row.amountUsd.toString()));
  const profit = profitRevenue.minus(profitCost).minus(profitExternal);
  return {
    revenueUsd: revenue.length ? sum(revenue).toNumber() : null,
    platformCostUsd: cost.length ? sum(cost).toNumber() : null,
    externalCostUsd: external.toNumber(),
    profitRevenueUsd: matched.length ? profitRevenue.toNumber() : null,
    profitPlatformCostUsd: matched.length ? profitCost.toNumber() : null,
    profitExternalCostUsd: matched.length ? profitExternal.toNumber() : null,
    unmatchedExternalCostUsd: external.minus(profitExternal).toNumber(),
    unmatchedExpenses: recorded.length - matchedExpenses.length,
    profitUsd: matched.length ? profit.toNumber() : null,
    margin:
      matched.length && profitRevenue.gt(0)
        ? profit.div(profitRevenue).times(100).toNumber()
        : null,
    revenueDays: revenue.length,
    costDays: cost.length,
    matchedDays: matched.length,
    coveredDates,
    days: range.days,
    complete: matched.length === range.days,
    recordedExpenses: recorded.length,
  };
}
