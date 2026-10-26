/** Public 30-day scenarios, not observed revenue or statistical confidence bounds. */
export const EARNINGS_POLICY = {
  version: "public-scenarios-v3",
  days: 30,
  creatorShare: 0.8,
  payingFractions: [0.1, 0.3, 0.7],
  unitsPerRun: [10, 100, 1000],
} as const;

export interface ActorEarnings {
  status: "estimated" | "free" | "unavailable";
  lowUsd: number | null;
  centralUsd: number | null;
  highUsd: number | null;
  model: string | null;
  unitPriceUsd: number | null;
  unit: string | null;
  basis: "runs" | "users" | null;
  usageCount: number | null;
  unitsPerRun: readonly number[] | null;
  startPriceUsd: number;
  reason: string | null;
}
export interface EarningsRollup {
  totalActors: number;
  coveredActors: number;
  unavailableActors: number;
  lowUsd: number | null;
  centralUsd: number | null;
  highUsd: number | null;
  averageActorUsd: number | null;
  minimumActorUsd: number | null;
  maximumActorUsd: number | null;
}
type JsonRecord = Record<string, unknown>;
function object(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function parse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function eventPrice(event: JsonRecord): number | null {
  return (
    number(event.eventPriceUsd) ??
    number(object(object(event.eventTieredPricingUsd)?.FREE)?.tieredEventPriceUsd)
  );
}
export function estimateActorEarnings(input: {
  pricingInfos: unknown;
  runs30Days: number | null;
  users30Days: number | null;
  now?: number;
}): ActorEarnings {
  const missing = (reason: string, model: string | null = null): ActorEarnings => ({
    status: "unavailable",
    lowUsd: null,
    centralUsd: null,
    highUsd: null,
    model,
    unitPriceUsd: null,
    unit: null,
    basis: null,
    usageCount: null,
    unitsPerRun: null,
    startPriceUsd: 0,
    reason,
  });
  const now = input.now ?? Date.now();
  const raw = parse(input.pricingInfos);
  const records = (Array.isArray(raw) ? raw : [])
    .flatMap((value) => {
      const record = object(value);
      if (!record) return [];
      const start = record.startedAt == null ? 0 : Date.parse(String(record.startedAt));
      const end = record.endedAt == null ? Infinity : Date.parse(String(record.endedAt));
      return Number.isFinite(start) && start <= now && end > now ? [{ record, start }] : [];
    })
    .sort((a, b) => b.start - a.start);
  const pricing = records[0]?.record;
  if (!pricing) return missing("Current public pricing is unavailable.");
  const model = typeof pricing.pricingModel === "string" ? pricing.pricingModel : null;
  if (model === "RENTAL" && now >= Date.parse("2026-10-01T00:00:00.000Z")) {
    return missing(
      "Apify retired rental pricing on 2026-10-01; this listing may not have synchronized yet.",
      model,
    );
  }
  if (pricing.currency && pricing.currency !== "USD")
    return missing("Only published USD pricing is supported.", model);
  const free = (): ActorEarnings => ({
    status: "free",
    lowUsd: 0,
    centralUsd: 0,
    highUsd: 0,
    model,
    unitPriceUsd: 0,
    unit: null,
    basis: null,
    usageCount: null,
    unitsPerRun: null,
    startPriceUsd: 0,
    reason: "No published developer fee; platform usage costs may still apply.",
  });
  if (model === "FREE" || model === "PAY_PER_USAGE") return free();
  let price = number(pricing.pricePerUnitUsd);
  let unit = typeof pricing.unitName === "string" ? pricing.unitName : "result";
  let units: readonly number[] = EARNINGS_POLICY.unitsPerRun;
  let startPrice = 0;
  let basis: "runs" | "users" = "runs";
  if (model === "PAY_PER_EVENT") {
    const events = Object.entries(
      object(object(pricing.pricingPerEvent)?.actorChargeEvents) ?? {},
    ).flatMap(([name, value]) => {
      const event = object(value);
      return event ? [{ name, event }] : [];
    });
    const primaryEvents = events.filter(({ event }) => event.isPrimaryEvent === true);
    const primary =
      primaryEvents.length === 1
        ? primaryEvents[0]
        : primaryEvents.length === 0 && events.length === 1
          ? events[0]
          : undefined;
    if (!primary)
      return missing("A primary charge event is required for an earnings estimate.", model);
    price = eventPrice(primary.event);
    unit = typeof primary.event.eventTitle === "string" ? primary.event.eventTitle : primary.name;
    // A custom one-time event is emitted by the Actor's own logic. A
    // subscription may emit it once per customer per month, despite millions
    // of runs. Only Apify's known start event has a per-run charge basis.
    if (
      primary.name !== "apify-actor-start" &&
      primary.event.isOneTimeEvent === true &&
      price !== null &&
      price > 0
    ) {
      return missing(
        "Public usage does not reveal the charge count for this one-time event (for example, a monthly subscription).",
        model,
      );
    }
    if (primary.name === "apify-actor-start") units = [1, 1, 1];
    const start = events.find(({ name }) => name === "apify-actor-start" && name !== primary.name);
    if (start) {
      const amount = eventPrice(start.event);
      if (amount == null) return missing("The published start-event price is unavailable.", model);
      startPrice = amount;
    }
    if (price === 0 && events.some(({ event }) => (eventPrice(event) ?? 0) > 0)) {
      return missing("A zero-price primary event does not cover the other paid events.", model);
    }
  } else if (model === "FLAT_PRICE_PER_MONTH" || model === "FLAT_PRICE" || model === "RENTAL") {
    if (now >= Date.parse("2026-10-01T00:00:00Z"))
      return missing(
        "Rental pricing was retired on 2026-10-01. Refresh the catalog for the current pricing model.",
        model,
      );
    basis = "users";
    units = [1, 1, 1];
    unit = "monthly rental";
  } else if (model !== "PAY_PER_RESULT" && model !== "PRICE_PER_DATASET_ITEM") {
    return missing("This pricing model has no supported public earnings calculation.", model);
  }
  if (price == null) return missing("The published unit price is unavailable.", model);
  if (price === 0 && startPrice === 0) return free();
  const usage = number(basis === "users" ? input.users30Days : input.runs30Days);
  if (usage == null) return missing(`Public 30-day ${basis} are unavailable.`, model);
  const values = EARNINGS_POLICY.payingFractions.map(
    (fraction, index) =>
      usage * fraction * (price * units[index] + startPrice) * EARNINGS_POLICY.creatorShare,
  );
  if (values.some((value) => !Number.isFinite(value)))
    return missing("Public inputs exceed the supported calculation range.", model);
  return {
    status: "estimated",
    lowUsd: values[0],
    centralUsd: values[1],
    highUsd: values[2],
    model,
    unitPriceUsd: price,
    unit,
    basis,
    usageCount: usage,
    unitsPerRun: units,
    startPriceUsd: startPrice,
    reason: null,
  };
}
export function rollupEarnings(values: readonly ActorEarnings[]): EarningsRollup {
  const covered = values.filter((value) => value.centralUsd != null);
  return {
    totalActors: values.length,
    coveredActors: covered.length,
    unavailableActors: values.length - covered.length,
    lowUsd: covered.length ? covered.reduce((sum, value) => sum + value.lowUsd!, 0) : null,
    centralUsd: covered.length ? covered.reduce((sum, value) => sum + value.centralUsd!, 0) : null,
    highUsd: covered.length ? covered.reduce((sum, value) => sum + value.highUsd!, 0) : null,
    averageActorUsd: covered.length
      ? covered.reduce((sum, value) => sum + value.centralUsd!, 0) / covered.length
      : null,
    minimumActorUsd: covered.length
      ? covered.reduce((min, value) => Math.min(min, value.centralUsd!), Infinity)
      : null,
    maximumActorUsd: covered.length
      ? covered.reduce((max, value) => Math.max(max, value.centralUsd!), 0)
      : null,
  };
}
