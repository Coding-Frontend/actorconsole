"use client";

import { InteractiveBarChart } from "@/components/marketing/interactive-bar-chart";

type ObservedPoint = {
  date: string;
  value: number | null;
  observed?: boolean;
  coverage?: { known: number; total: number };
};

const toneClasses = {
  blue: {
    note: "border-signal-blue",
  },
  orange: {
    note: "border-signal-orange",
  },
} as const;

export function ObservedMetricBarChart({
  points,
  label,
  tone,
  emptyMessage = "No observed values are available for this period yet.",
}: {
  points: ObservedPoint[];
  label: string;
  tone: keyof typeof toneClasses;
  emptyMessage?: string;
}) {
  const captured = points.filter(
    (point): point is ObservedPoint & { value: number } =>
      point.value != null && point.observed !== false,
  );
  const first = captured[0];
  const latestObserved = captured.at(-1);
  const latest = latestObserved;
  const partial = captured.some(
    (point) => point.coverage && point.coverage.known < point.coverage.total,
  );
  const latestCoverage = latest?.coverage;
  const latestPartial = latestCoverage && latestCoverage.known < latestCoverage.total;
  const coverageMessage = partial
    ? `Some dates have partial totals; unknown values are excluded, not counted as zero.${latestCoverage ? ` Latest coverage: ${latestCoverage.known} of ${latestCoverage.total} Actors.` : ""}`
    : null;
  const change =
    !partial && first && latestObserved && first.date !== latestObserved.date
      ? latestObserved.value - first.value
      : null;
  const classes = toneClasses[tone];

  if (!latest) {
    return (
      <div className="border border-dashed border-border bg-muted/25 px-5 py-14 text-center">
        <p className="font-semibold">No observed {label.toLocaleLowerCase()} yet</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {emptyMessage}
        </p>
      </div>
    );
  }

  // A single point cannot communicate a trend. Rendering it as a full-height
  // bar made fresh Builder and Actor profiles look as if their history had
  // failed to load. Keep the live reading visible, but reserve the bar chart
  // for the first comparable pair of daily Store snapshots.
  if (captured.length < 2) {
    return (
      <div className="border border-dashed border-border bg-muted/25 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="type-kicker">
              Latest captured {label}
              {latestPartial ? " · Partial total" : ""}
            </p>
            <p className="font-display-tight mt-2 text-4xl tabular-nums">
              {latest.value.toLocaleString("en-IN")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {captured.length} of {points.length} UTC days captured
          </p>
        </div>
        <div className={`mt-5 border-l-2 bg-card px-4 py-3 ${classes.note}`}>
          <p className="font-semibold">Trend baseline is forming</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            The first observation was captured on {formatDate(first.date)}. Daily bars and change
            arrows appear after the next UTC catalog snapshot.
          </p>
          {coverageMessage ? (
            <p className="mt-3 text-xs text-muted-foreground">{coverageMessage}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-kicker">
            Latest captured {label}
            {latestPartial ? " · Partial total" : ""}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <p className="font-display-tight text-3xl tabular-nums">
              {latest.value.toLocaleString("en-IN")}
            </p>
            {change == null ? (
              <p className="font-mono text-xs text-muted-foreground">
                {partial
                  ? "Change unavailable: incomplete coverage"
                  : `Baseline starts ${formatDate(first?.date ?? latest.date)}`}
              </p>
            ) : (
              <p
                className={`font-mono text-xs ${
                  change > 0
                    ? "text-signal-green"
                    : change < 0
                      ? "text-signal-orange"
                      : "text-muted-foreground"
                }`}
              >
                {change > 0 ? "+" : ""}
                {change.toLocaleString("en-IN")} since {formatDate(first.date)}
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {captured.length} of {points.length} UTC days captured
        </p>
      </div>

      <InteractiveBarChart points={points} label={label} tone={tone} />
      {coverageMessage ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{coverageMessage}</p>
      ) : null}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
