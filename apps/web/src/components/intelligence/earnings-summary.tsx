import { EARNINGS_POLICY, type ActorEarnings } from "@actorconsole/shared/actor-earnings";

export function earningsMoney(value: number | null | undefined, compact = false) {
  return value == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
        ...(value >= (compact ? 1000 : 10000)
          ? { notation: "compact" as const, maximumFractionDigits: 1 }
          : {}),
      }).format(value);
}
type Range = Pick<ActorEarnings, "lowUsd" | "centralUsd" | "highUsd">;
export function EarningsBand({
  value,
  compact = false,
  emphasizeCentral = false,
}: {
  value?: Range | null;
  compact?: boolean;
  emphasizeCentral?: boolean;
}) {
  return (
    <dl
      aria-label="Estimated monthly creator revenue"
      className={`grid grid-cols-3 gap-x-2 gap-y-2 sm:gap-x-4 ${compact ? "text-[10px] sm:text-xs" : "text-sm"}`}
    >
      {(
        [
          ["Low", value?.lowUsd],
          ["Central", value?.centralUsd],
          ["High", value?.highUsd],
        ] as const
      ).map(([label, amount]) => (
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd
            title={
              amount == null
                ? "Unavailable"
                : new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 6,
                  }).format(amount)
            }
            className={`mt-1 break-words font-semibold tabular-nums ${emphasizeCentral && label === "Central" ? "text-signal-blue" : ""} ${compact ? "" : "text-lg sm:text-xl"}`}
          >
            {compact ? (
              amount == null ? (
                "—"
              ) : (
                earningsMoney(amount, true)
              )
            ) : (
              <>
                <span className="sm:hidden">{earningsMoney(amount, true)}</span>
                <span className="hidden sm:inline">{earningsMoney(amount)}</span>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function EarningsMethod() {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        Calculation & assumptions
      </summary>
      <div className="mt-3 max-w-[75ch] space-y-3 text-xs leading-5 text-muted-foreground">
        <p>
          These are 30-day scenarios based on current public pricing and rolling usage. Low,
          central, and high use assumed paying fractions of 10%, 30%, and 70%. They are not measured
          minimums, averages, maximums, or forecasts.
        </p>
        <p>
          Per-result and primary-event scenarios assume 10, 100, and 1,000 billed units per paying
          run. Apify start events assume one charge per run; a known start fee is added to
          primary-event pricing. Paid custom one-time events, including subscription passes, are
          unavailable because public usage does not reveal their charge counts. Other events,
          discounts, refunds, trials, success rates, and partner arrangements are not modeled.
          Legacy rental entries use monthly users × the published monthly price × the paying
          fraction. Apify retired rental pricing on 2026-10-01 and migrated remaining rental Actors
          to pay-per-usage; stale rental entries after that date are unavailable.
        </p>
        <p>
          Each scenario applies an assumed {EARNINGS_POLICY.creatorShare * 100}% creator share.
          Platform usage costs, external expenses, and taxes are excluded. Estimated creator revenue
          is not profit or a payout statement. Unknown prices or usage remain unavailable; portfolio
          totals include only covered Actors.
        </p>
        <a
          className="inline-block underline underline-offset-4"
          href="https://docs.apify.com/actors/publishing/monetize/pay-per-event"
          target="_blank"
          rel="noreferrer"
        >
          Apify pricing and creator revenue documentation
        </a>
      </div>
    </details>
  );
}
