interface ProfitAmounts {
  costUsd?: number;
  revenueUsd?: number;
  profitUsd?: number;
  margin?: number;
}

export interface OwnerAnalytics {
  actorBreakdown?: {
    monetizationPerActor?: Array<{
      earningsStats?: {
        totalRevenueUsd?: number;
        totalCostUsd?: number;
        totalProfitUsd?: number;
      };
      usersStats?: { freeUsers?: number; payingUsers?: number };
      chargedResults?: number;
    }>;
  };
  costsPerThousandResults?: {
    dailyActorRunsCost?: Record<string, number>;
    totalActorRunsCost?: { avgActorRunsCost?: number };
  };
  profitMargin?: {
    totalProfitMarginStats?: { payingUsersUsd?: ProfitAmounts; allUsersUsd?: ProfitAmounts };
    dailyProfitMarginStats?: Record<
      string,
      { payingUsersUsd?: ProfitAmounts; allUsersUsd?: ProfitAmounts }
    >;
  };
}

export interface ActorInsightMoneySnapshot {
  capturedOn: string | Date;
  costUsd: number | null;
  revenueUsd: number | null;
  profitUsd: number | null;
  profitMargin: number | null;
  monetization?: unknown;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Rebuild the owner analytics surface from database-first insight snapshots. */
export function persistedOwnerAnalyticsFromSnapshots(
  snapshots: ActorInsightMoneySnapshot[],
): OwnerAnalytics[] {
  const payloads = snapshots
    .map((snapshot) => recordValue(snapshot.monetization))
    .filter((payload): payload is Record<string, unknown> => payload !== null);
  const actorBreakdown = payloads
    .map((payload) => recordValue(payload.actorBreakdown))
    .find((value) => value !== null);
  const totalProfitMarginStats = payloads
    .map((payload) => recordValue(payload.totalProfitMarginStats))
    .find((value) => value !== null);
  const dailyProfitMarginStats = payloads
    .map((payload) => recordValue(payload.dailyProfitMarginStats))
    .find((value) => value !== null);
  const hasScalarMoney = snapshots.some(
    (snapshot) =>
      snapshot.costUsd != null || snapshot.revenueUsd != null || snapshot.profitUsd != null,
  );

  if (!actorBreakdown && !totalProfitMarginStats && !dailyProfitMarginStats && !hasScalarMoney) {
    return [];
  }

  const scalarTotals = snapshots.reduce(
    (total, snapshot) => ({
      costUsd: total.costUsd + (snapshot.costUsd ?? 0),
      revenueUsd: total.revenueUsd + (snapshot.revenueUsd ?? 0),
      profitUsd: total.profitUsd + (snapshot.profitUsd ?? 0),
    }),
    { costUsd: 0, revenueUsd: 0, profitUsd: 0 },
  );
  const scalarDaily = Object.fromEntries(
    snapshots.map((snapshot) => [
      new Date(snapshot.capturedOn).toISOString().slice(0, 10),
      {
        payingUsersUsd: {
          costUsd: snapshot.costUsd ?? 0,
          revenueUsd: snapshot.revenueUsd ?? 0,
          profitUsd: snapshot.profitUsd ?? 0,
          margin: snapshot.profitMargin ?? 0,
        },
      },
    ]),
  );

  return [
    {
      ...(actorBreakdown
        ? { actorBreakdown: actorBreakdown as OwnerAnalytics["actorBreakdown"] }
        : {}),
      profitMargin: {
        totalProfitMarginStats: totalProfitMarginStats
          ? (totalProfitMarginStats as NonNullable<
              OwnerAnalytics["profitMargin"]
            >["totalProfitMarginStats"])
          : { payingUsersUsd: scalarTotals },
        dailyProfitMarginStats: dailyProfitMarginStats
          ? (dailyProfitMarginStats as NonNullable<
              OwnerAnalytics["profitMargin"]
            >["dailyProfitMarginStats"])
          : hasScalarMoney
            ? scalarDaily
            : undefined,
      },
    },
  ];
}
