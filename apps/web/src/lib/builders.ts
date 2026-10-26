import { buildDailyPortfolioTrends } from "@actorconsole/shared/builder-history";
export { buildDailyPortfolioTrends };
import { backendData } from "./backend-data";
import type { ActorEarnings, EarningsRollup } from "@actorconsole/shared/actor-earnings";
export type BuilderMetric =
  | "new-actors"
  | "actors"
  | "monthly-users"
  | "total-users"
  | "monthly-runs"
  | "total-runs"
  | "estimated-revenue";

export type BuilderWindow = 7 | 30 | 90;

export type BuilderSortDirection = "asc" | "desc";

export type BuilderActorSort =
  "active-users" | "runs-30d" | "total-users" | "total-runs" | "rating" | "newest" | "name";

export const BUILDER_ACTOR_SORTS: Array<{ value: BuilderActorSort; label: string }> = [
  { value: "active-users", label: "Active users" },
  { value: "runs-30d", label: "30-day runs" },
  { value: "total-users", label: "Total users" },
  { value: "total-runs", label: "Total runs" },
  { value: "rating", label: "Rating" },
  { value: "newest", label: "Newest published" },
  { value: "name", label: "Actor name" },
];

export const BUILDER_METRICS: Array<{
  value: BuilderMetric;
  label: string;
  group: "Publishing" | "Users" | "Runs" | "Earnings";
}> = [
  { value: "new-actors", label: "New Actors", group: "Publishing" },
  { value: "actors", label: "Total Actors", group: "Publishing" },
  { value: "monthly-users", label: "Active users", group: "Users" },
  { value: "total-users", label: "Total users", group: "Users" },
  { value: "monthly-runs", label: "30-day runs", group: "Runs" },
  { value: "total-runs", label: "Total runs", group: "Runs" },
  { value: "estimated-revenue", label: "Estimated revenue / 30d", group: "Earnings" },
];

export const BUILDER_WINDOWS: BuilderWindow[] = [7, 30, 90];

export interface BuilderLeaderboardEntry {
  earnings?: EarningsRollup;
  username: string;
  name: string | null;
  bio: string | null;
  pictureUrl: string | null;
  actorCount: number;
  activeUsers: number;
  totalUsers: number;
  recentRuns: number;
  totalRuns: number;
  newActorCount: number;
  lastUpdatedAt: Date;
  rank: number;
  changes: Record<BuilderMetric, number | null>;
}

export interface BuilderActorEntry {
  earnings?: ActorEarnings;
  id: string;
  name: string;
  title: string;
  description: string | null;
  pictureUrl: string | null;
  effectivePictureUrl: string | null;
  pictureSource: "actor" | "website" | "fallback";
  website: { id: string; slug: string; name: string; canonicalDomain: string | null } | null;
  activeUsers: number;
  users7Days: number;
  users30Days: number;
  users90Days: number;
  totalUsers: number;
  runs30Days: number;
  totalRuns: number;
  rating: number | null;
  reviewCount: number;
  firstPublishedAt: Date | null;
  internalUrl: string;
  apifyUrl: string;
}

export type BuilderMetricRanks = Record<BuilderMetric, number>;

export interface BuilderProfile {
  isAvailable?: boolean;
  earnings?: EarningsRollup;
  username: string;
  name: string | null;
  bio: string | null;
  pictureUrl: string | null;
  apifyUrl: string;
  actorCount: number;
  activeUsers: number;
  totalUsers: number;
  recentRuns: number;
  totalRuns: number;
  newActorCount: number;
  ranks: BuilderMetricRanks;
  totalBuilders: number;
  lastUpdatedAt: Date;
  window: BuilderWindow;
  publishingChart: Array<{ date: string; actors: number }>;
  trendChart: Array<{
    date: string;
    observed: boolean;
    runs: number | null;
    users: number | null;
  }>;
  actors: BuilderActorEntry[];
  actorPage: number;
  actorPageCount: number;
  actorTotal: number;
  actorCategories: string[];
  actorFilters: {
    query: string;
    category: string;
    sort: BuilderActorSort;
  };
  changes: { users: number | null; runs: number | null };
}

export interface BuilderActorPricing {
  model: string;
  pricePerUnitUsd: number | null;
  unitName: string | null;
  trialMinutes: number | null;
  eventCount: number;
  events: Array<{
    name: string;
    title: string;
    description: string | null;
    priceUsd: number | null;
    isPrimary: boolean;
    isOneTime: boolean;
  }>;
}

export interface BuilderActorDetail extends BuilderActorEntry {
  isAvailable?: boolean;
  username: string;
  ownerName: string | null;
  ownerPictureUrl: string | null;
  apifyActorId: string;
  createdAt: Date | null;
  modifiedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  detailsSyncedAt: Date | null;
  bookmarks: number;
  categories: string[];
  metaLabels: string[];
  pricing: BuilderActorPricing[];
  trend: Array<{
    date: string;
    observed: boolean;
    users: number | null;
    runs: number | null;
    totalUsers: number;
    totalRuns: number;
  }>;
  relatedActors: BuilderActorEntry[];
}

export function newlyPublishedWhere(
  start: Date,
  baseline: Date | null,
  end?: Date,
): Record<string, unknown> {
  const range = { gte: start, ...(end ? { lt: end } : {}) };
  return {
    OR: [
      { firstPublishedAt: range },
      // The public Store search response does not expose firstPublishedAt.
      // ActorHunt's daily publication series matches the canonical Actor API
      // createdAt date for public Actors, so use it to backfill history when
      // an owner-scoped Console publication timestamp is unavailable.
      { firstPublishedAt: null, apifyCreatedAt: range },
      ...(baseline
        ? [
            {
              firstPublishedAt: null,
              apifyCreatedAt: null,
              firstSeenAt: { ...range, gt: baseline },
            } satisfies Record<string, unknown>,
          ]
        : []),
    ],
  };
}

export function metricLabel(metric: BuilderMetric, window: BuilderWindow) {
  if (metric === "new-actors") return `New Actors (${window} days)`;
  if (metric === "monthly-users") return `Active users (${window} days)`;
  return BUILDER_METRICS.find((item) => item.value === metric)?.label ?? "Leaderboard";
}

export function pricingEntries(value: unknown | null): BuilderActorPricing[] {
  if (!Array.isArray(value)) return [];
  const records = value.filter((item): item is Record<string, unknown> =>
    Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
  const now = Date.now();
  const effectiveRecords = records.filter((record) => {
    if (typeof record.startedAt !== "string") return true;
    const startedAt = Date.parse(record.startedAt);
    return Number.isFinite(startedAt) && startedAt <= now;
  });
  const selected = [...(effectiveRecords.length ? effectiveRecords : records)]
    .sort((left, right) => {
      const leftTime = typeof left.startedAt === "string" ? Date.parse(left.startedAt) : 0;
      const rightTime = typeof right.startedAt === "string" ? Date.parse(right.startedAt) : 0;
      return (
        (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0)
      );
    })
    .at(-1);
  if (!selected) return [];

  return [selected].flatMap((record) => {
    const perEvent = record.pricingPerEvent;
    const actorChargeEvents =
      perEvent && typeof perEvent === "object" && !Array.isArray(perEvent)
        ? (perEvent as Record<string, unknown>).actorChargeEvents
        : null;
    const events =
      actorChargeEvents &&
      typeof actorChargeEvents === "object" &&
      !Array.isArray(actorChargeEvents)
        ? Object.entries(actorChargeEvents).flatMap(([name, event]) => {
            if (!event || typeof event !== "object" || Array.isArray(event)) return [];
            const details = event as Record<string, unknown>;
            const tieredPricing = details.eventTieredPricingUsd;
            const freeTier =
              tieredPricing && typeof tieredPricing === "object" && !Array.isArray(tieredPricing)
                ? (tieredPricing as Record<string, unknown>).FREE
                : null;
            const freeTierPrice =
              freeTier && typeof freeTier === "object" && !Array.isArray(freeTier)
                ? (freeTier as Record<string, unknown>).tieredEventPriceUsd
                : null;
            return [
              {
                name,
                title: typeof details.eventTitle === "string" ? details.eventTitle : name,
                description:
                  typeof details.eventDescription === "string" ? details.eventDescription : null,
                priceUsd:
                  typeof details.eventPriceUsd === "number"
                    ? details.eventPriceUsd
                    : typeof freeTierPrice === "number"
                      ? freeTierPrice
                      : null,
                isPrimary: details.isPrimaryEvent === true,
                isOneTime: details.isOneTimeEvent === true,
              },
            ];
          })
        : [];
    return [
      {
        model: typeof record.pricingModel === "string" ? record.pricingModel : "UNKNOWN",
        pricePerUnitUsd: typeof record.pricePerUnitUsd === "number" ? record.pricePerUnitUsd : null,
        unitName: typeof record.unitName === "string" ? record.unitName : null,
        trialMinutes: typeof record.trialMinutes === "number" ? record.trialMinutes : null,
        eventCount: events.length,
        events,
      },
    ];
  });
}

export function effectiveActorPicture(input: {
  actorPictureUrl: string | null;
  websiteLogoId: string | null;
}) {
  const websiteUrl = input.websiteLogoId ? `/api/website-logo-assets/${input.websiteLogoId}` : null;
  return {
    effectivePictureUrl: input.actorPictureUrl ?? websiteUrl,
    pictureSource: input.actorPictureUrl
      ? ("actor" as const)
      : websiteUrl
        ? ("website" as const)
        : ("fallback" as const),
  };
}

export async function getBuilderCatalogSummary(): Promise<{
  totalBuilders: number;
  catalogActorCount: number;
  enrichedActorCount: number;
  users30Days: number;
  totalUsers: number;
  reportedUserActors: number;
  earnings: EarningsRollup;
}> {
  return backendData<{
    totalBuilders: number;
    catalogActorCount: number;
    enrichedActorCount: number;
    users30Days: number;
    totalUsers: number;
    reportedUserActors: number;
    earnings: EarningsRollup;
  }>("summary", []);
}

export async function getBuildersForComparison(
  usernames: string[],
  window: BuilderWindow = 30,
  limit = 5,
): Promise<
  Array<Omit<BuilderLeaderboardEntry, "bio" | "changes"> & { ranks: BuilderMetricRanks }>
> {
  return backendData<
    Array<Omit<BuilderLeaderboardEntry, "bio" | "changes"> & { ranks: BuilderMetricRanks }>
  >("comparison-builders", [usernames, window, limit]);
}

export async function getBuilderComparisonHistory(
  usernames: string[],
  window: BuilderWindow,
): Promise<Map<string, BuilderProfile["trendChart"]>> {
  return backendData<Map<string, BuilderProfile["trendChart"]>>("comparison-history", [
    usernames,
    window,
  ]);
}

export async function searchBuildersForComparison(
  query: string,
  window: BuilderWindow = 30,
): Promise<
  Array<Omit<BuilderLeaderboardEntry, "bio" | "changes"> & { ranks: BuilderMetricRanks }>
> {
  return backendData<
    Array<Omit<BuilderLeaderboardEntry, "bio" | "changes"> & { ranks: BuilderMetricRanks }>
  >("search-builders", [query, window]);
}

export async function searchActorsForComparison(
  query: string,
  window: BuilderWindow = 30,
): Promise<Array<{ username: string; actor: BuilderActorEntry }>> {
  return backendData<Array<{ username: string; actor: BuilderActorEntry }>>("search-actors", [
    query,
    window,
  ]);
}

export async function getBuilderLeaderboard(options: {
  metric: BuilderMetric;
  direction?: BuilderSortDirection;
  window?: BuilderWindow;
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: BuilderLeaderboardEntry[];
  total: number;
  totalBuilders: number;
  page: number;
  pageCount: number;
  catalogActorCount: number;
  enrichedActorCount: number;
  latestSearchSyncAt: Date | null;
  latestDetailsSyncAt: Date | null;
}> {
  return backendData<{
    items: BuilderLeaderboardEntry[];
    total: number;
    totalBuilders: number;
    page: number;
    pageCount: number;
    catalogActorCount: number;
    enrichedActorCount: number;
    latestSearchSyncAt: Date | null;
    latestDetailsSyncAt: Date | null;
  }>("leaderboard", [options]);
}

export async function getBuilderProfile(
  username: string,
  options: {
    window?: BuilderWindow;
    actorPage?: number;
    actorPageSize?: number;
    actorQuery?: string;
    actorCategory?: string;
    actorSort?: BuilderActorSort;
  } = {},
): Promise<BuilderProfile | null> {
  return backendData<BuilderProfile | null>("profile", [username, options]);
}

export async function getBuilderActorDetail(
  username: string,
  actorName: string,
  window: BuilderWindow = 30,
): Promise<BuilderActorDetail | null> {
  return backendData<BuilderActorDetail | null>("actor", [username, actorName, window]);
}
