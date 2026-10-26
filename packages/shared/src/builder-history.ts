type Snapshot = {
  storeActorId: string;
  capturedAt: Date;
  users30Days: number | null;
  runs30Days: number | null;
};

export type HistoricalActor = {
  storeActorId: string;
  firstSeenAt: Date;
  lastSeenAt?: Date;
};

function utcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Historical membership is independent of whether a listing is still public today. */
export function buildDailyPortfolioTrends(
  rows: Snapshot[],
  window: 7 | 30 | 90,
  actorAvailability: HistoricalActor[],
  options: { currentDayComplete?: boolean } = {},
) {
  const latest = new Map<string, Snapshot>();
  for (const row of rows) {
    const key = `${row.storeActorId}:${utcDay(row.capturedAt)}`;
    const previous = latest.get(key);
    if (!previous || row.capturedAt >= previous.capturedAt) latest.set(key, row);
  }
  const actors = actorAvailability.map((actor) => ({
    id: actor.storeActorId,
    first: utcDay(actor.firstSeenAt),
    last: actor.lastSeenAt ? utcDay(actor.lastSeenAt) : Infinity,
  }));
  const today = utcDay(new Date());
  return Array.from({ length: window }, (_, index) => {
    const day = today - (window - 1 - index) * 86_400_000;
    const expected = actors.filter((actor) => actor.first <= day && day <= actor.last);
    const points = expected.map((actor) => latest.get(`${actor.id}:${day}`));
    const complete =
      expected.length > 0 &&
      points.every((point) => point != null) &&
      (day !== today || options.currentDayComplete === true);
    // Preserve available counters without inventing zeros for unknown ones.
    // Missing Actor snapshots still leave a gap; missing run counters
    // produce an explicitly covered, partial total.
    const userPoints = points.filter((point) => point?.users30Days != null);
    const runPoints = points.filter((point) => point?.runs30Days != null);
    const users =
      complete && userPoints.length === expected.length
        ? userPoints.reduce((sum, point) => sum + point!.users30Days!, 0)
        : null;
    const runs =
      complete && runPoints.length
        ? runPoints.reduce((sum, point) => sum + point!.runs30Days!, 0)
        : null;
    return {
      date: new Date(day).toISOString().slice(0, 10),
      observed: complete && (users !== null || runs !== null),
      users,
      runs,
      usersCoverage: { known: userPoints.length, total: expected.length },
      runsCoverage: { known: runPoints.length, total: expected.length },
    };
  });
}
