import { buildDailyPortfolioTrends } from "@actorconsole/shared/builder-history";
export { buildDailyPortfolioTrends };

import { getPublicActor } from "@actorconsole/apify";
import { getPublicActorStoreRating } from "./public-actor-content.js";
import { db, Prisma } from "@actorconsole/db";
import { publicCache } from "./public-cache.js";
import { getBuilderEarnings } from "./builder-earnings.js";
import {
  estimateActorEarnings,
  type ActorEarnings,
  type EarningsRollup,
} from "@actorconsole/shared/actor-earnings";

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

async function optionalWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Sitemap reconciliation retains a small number of public URLs that the
// Store API no longer returns. Those durable placeholders use `owner/name`
// as their temporary ID (real Apify Actor IDs never contain a slash) and have
// no rolling metric snapshot. Keep them out of ranking, coverage and profile
// charts so missing Store records cannot masquerade as zero-usage Actors.
const PUBLIC_CATALOG_ACTOR_WHERE = {
  isPublic: true,
  isDeprecated: false,
  apifyActorId: { not: { contains: "/" } },
} satisfies Prisma.StoreActorWhereInput;

// Retired listings retain their recorded history; they never enter current rankings.
const HISTORICAL_CATALOG_ACTOR_WHERE = {
  apifyActorId: { not: { contains: "/" } },
} satisfies Prisma.StoreActorWhereInput;

type SnapshotPoint = {
  capturedAt: Date;
  runs30d: number | null;
  totalRuns: number | null;
  totalUsers: number | null;
  activeUsers: number | null;
};

type StoreActorRow = {
  isPublic: boolean;
  isDeprecated: boolean;
  id: string;
  apifyActorId: string;
  username: string;
  actorName: string;
  title: string | null;
  description: string | null;
  pictureUrl: string | null;
  websiteIdentity: {
    id: string;
    slug: string;
    name: string;
    canonicalDomain: string | null;
    currentLogoId: string | null;
  } | null;
  ownerName: string | null;
  ownerPictureUrl: string | null;
  firstPublishedAt: Date | null;
  apifyCreatedAt: Date | null;
  apifyModifiedAt: Date | null;
  totalRuns: number | null;
  totalUsers: number | null;
  users7Days: number | null;
  users30Days: number | null;
  users90Days: number | null;
  runs30Days: number | null;
  reviewCount: number | null;
  reviewRating: number | null;
  bookmarkCount: number | null;
  categories: Prisma.JsonValue | null;
  metaLabels: Prisma.JsonValue | null;
  pricingInfos: Prisma.JsonValue | null;
  firstSeenAt: Date;
  detailsSyncedAt: Date | null;
  detailsSyncError: string | null;
  lastSeenAt: Date;
  updatedAt: Date;
  snapshots?: Array<{
    capturedAt: Date;
    totalRuns: number | null;
    runs30Days: number | null;
    totalUsers: number | null;
    users30Days: number | null;
  }>;
};

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
  newActorCount: number | null;
  publicationDateCoverage?: { known: number; total: number };
  runCounterCoverage?: { known: number; total: number };
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
  newActorCount: number | null;
  publicationDateCoverage?: { known: number; total: number };
  runCounterCoverage?: { known: number; total: number };
  ranks: BuilderMetricRanks;
  totalBuilders: number;
  lastUpdatedAt: Date;
  window: BuilderWindow;
  publishingChart: Array<{ date: string; actors: number }>;
  discoveryChart: Array<{ date: string; actors: number }>;
  actorConsolePublishingChart: Array<{ date: string; actors: number }>;
  trendChart: Array<{
    date: string;
    observed: boolean;
    runs: number | null;
    users: number | null;
    usersCoverage?: { known: number; total: number };
    runsCoverage?: { known: number; total: number };
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

type AggregatedBuilder = Omit<BuilderLeaderboardEntry, "name" | "bio" | "pictureUrl" | "changes">;

function startOfUtcDay(date: Date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function windowCutoff(window: BuilderWindow) {
  const cutoff = startOfUtcDay(new Date());
  cutoff.setUTCDate(cutoff.getUTCDate() - window + 1);
  return cutoff;
}

export function newlyPublishedWhere(start: Date, end?: Date): Prisma.StoreActorWhereInput {
  const range = { gte: start, ...(end ? { lt: end } : {}) };
  return {
    // Upload and catalog-discovery timestamps do not establish publication.
    firstPublishedAt: range,
  };
}

function activeUsersForWindow(
  value: { users7Days: number | null; users30Days: number | null; users90Days: number | null },
  window: BuilderWindow,
) {
  if (window === 7) return value.users7Days ?? 0;
  if (window === 90) return value.users90Days ?? 0;
  return value.users30Days ?? 0;
}

export function metricLabel(metric: BuilderMetric, window: BuilderWindow) {
  if (metric === "new-actors") return `New Actors (${window} days)`;
  if (metric === "monthly-users") return `Active users (${window} days)`;
  return BUILDER_METRICS.find((item) => item.value === metric)?.label ?? "Leaderboard";
}

const getCachedBuilderCatalogSummary = publicCache(
  async () => {
    const where = { ...PUBLIC_CATALOG_ACTOR_WHERE, username: { not: "apify" } } as const;
    const [catalogActorCount, enrichedActorCount, builders, market] = await Promise.all([
      db.storeActor.count({ where }),
      db.storeActor.count({ where: { ...where, detailsSyncedAt: { not: null } } }),
      db.storeActor.findMany({ where, distinct: ["username"], select: { username: true } }),
      getBuilderEarnings(),
    ]);
    return {
      ...market.catalog,
      catalogActorCount,
      enrichedActorCount,
      totalBuilders: builders.length,
    };
  },
  ["builder-catalog-summary-v3"],
  { revalidate: 300 },
);

export async function getBuilderCatalogSummary() {
  return getCachedBuilderCatalogSummary();
}

function metricValue(value: AggregatedBuilder, metric: BuilderMetric) {
  if (metric === "estimated-revenue") return value.earnings?.centralUsd ?? -Infinity;
  if (metric === "new-actors") return value.newActorCount ?? -Infinity;
  if (metric === "actors") return value.actorCount;
  if (metric === "monthly-users") return value.activeUsers;
  if (metric === "total-users") return value.totalUsers;
  if (metric === "monthly-runs") return value.recentRuns;
  return value.totalRuns;
}

function ownerDisplayName(name: string | null | undefined, username: string) {
  if (!name) return null;
  const suffix = ` (${username})`;
  return name.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())
    ? name.slice(0, -suffix.length)
    : name;
}

function jsonStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function pricingEntries(value: Prisma.JsonValue | null): BuilderActorPricing[] {
  if (!Array.isArray(value)) return [];
  const records = value.filter((item): item is Prisma.JsonObject =>
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
        ? (perEvent as Record<string, Prisma.JsonValue>).actorChargeEvents
        : null;
    const events =
      actorChargeEvents &&
      typeof actorChargeEvents === "object" &&
      !Array.isArray(actorChargeEvents)
        ? Object.entries(actorChargeEvents).flatMap(([name, event]) => {
            if (!event || typeof event !== "object" || Array.isArray(event)) return [];
            const details = event as Record<string, Prisma.JsonValue>;
            const tieredPricing = details.eventTieredPricingUsd;
            const freeTier =
              tieredPricing && typeof tieredPricing === "object" && !Array.isArray(tieredPricing)
                ? (tieredPricing as Record<string, Prisma.JsonValue>).FREE
                : null;
            const freeTierPrice =
              freeTier && typeof freeTier === "object" && !Array.isArray(freeTier)
                ? (freeTier as Record<string, Prisma.JsonValue>).tieredEventPriceUsd
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

function toSnapshotPoints(actor: StoreActorRow): SnapshotPoint[] {
  if (actor.snapshots?.length) {
    return actor.snapshots.map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      runs30d: snapshot.runs30Days,
      totalRuns: snapshot.totalRuns,
      totalUsers: snapshot.totalUsers,
      activeUsers: snapshot.users30Days,
    }));
  }
  return [
    {
      capturedAt: actor.lastSeenAt,
      runs30d: actor.runs30Days,
      totalRuns: actor.totalRuns,
      totalUsers: actor.totalUsers,
      activeUsers: actor.users30Days,
    },
  ];
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

function actorEntry(actor: StoreActorRow, window: BuilderWindow): BuilderActorEntry {
  const { effectivePictureUrl, pictureSource } = effectiveActorPicture({
    actorPictureUrl: actor.pictureUrl,
    websiteLogoId: actor.websiteIdentity?.currentLogoId ?? null,
  });
  return {
    id: actor.id,
    earnings: estimateActorEarnings(actor),
    name: actor.actorName,
    title: actor.title ?? actor.actorName,
    description: actor.description,
    pictureUrl: effectivePictureUrl,
    effectivePictureUrl,
    pictureSource,
    website: actor.websiteIdentity
      ? {
          id: actor.websiteIdentity.id,
          slug: actor.websiteIdentity.slug,
          name: actor.websiteIdentity.name,
          canonicalDomain: actor.websiteIdentity.canonicalDomain,
        }
      : null,
    activeUsers: activeUsersForWindow(actor, window),
    users7Days: actor.users7Days ?? 0,
    users30Days: actor.users30Days ?? 0,
    users90Days: actor.users90Days ?? 0,
    totalUsers: actor.totalUsers ?? 0,
    runs30Days: actor.runs30Days ?? 0,
    totalRuns: actor.totalRuns ?? 0,
    rating: actor.reviewRating,
    reviewCount: actor.reviewCount ?? 0,
    firstPublishedAt: actor.firstPublishedAt,
    internalUrl: `/builders/${encodeURIComponent(actor.username)}/actors/${encodeURIComponent(actor.actorName)}`,
    apifyUrl: `https://apify.com/${actor.username}/${actor.actorName}`,
  };
}

const actorCoreSelect = {
  isPublic: true,
  isDeprecated: true,
  id: true,
  apifyActorId: true,
  username: true,
  actorName: true,
  title: true,
  description: true,
  pictureUrl: true,
  websiteIdentity: {
    select: {
      id: true,
      slug: true,
      name: true,
      canonicalDomain: true,
      currentLogoId: true,
    },
  },
  ownerName: true,
  ownerPictureUrl: true,
  firstPublishedAt: true,
  apifyCreatedAt: true,
  apifyModifiedAt: true,
  totalRuns: true,
  totalUsers: true,
  users7Days: true,
  users30Days: true,
  users90Days: true,
  runs30Days: true,
  reviewCount: true,
  reviewRating: true,
  bookmarkCount: true,
  categories: true,
  metaLabels: true,
  pricingInfos: true,
  firstSeenAt: true,
  detailsSyncedAt: true,
  detailsSyncError: true,
  lastSeenAt: true,
  updatedAt: true,
} satisfies Prisma.StoreActorSelect;

const actorSelect = {
  ...actorCoreSelect,
  snapshots: {
    orderBy: { capturedAt: "desc" as const },
    take: 90,
    select: {
      capturedAt: true,
      totalRuns: true,
      runs30Days: true,
      totalUsers: true,
      users30Days: true,
    },
  },
} satisfies Prisma.StoreActorSelect;

async function getAggregatedBuilderValues(window: BuilderWindow) {
  const baseWhere: Prisma.StoreActorWhereInput = {
    ...PUBLIC_CATALOG_ACTOR_WHERE,
    username: { not: "apify" },
  };

  const [groups, newActorGroups, market] = await Promise.all([
    db.storeActor.groupBy({
      by: ["username"],
      where: baseWhere,
      _count: { _all: true, firstPublishedAt: true, runs30Days: true },
      _sum: {
        users7Days: true,
        users30Days: true,
        users90Days: true,
        totalUsers: true,
        runs30Days: true,
        totalRuns: true,
      },
      _max: { lastSeenAt: true },
    }),
    db.storeActor.groupBy({
      by: ["username"],
      where: { ...baseWhere, ...newlyPublishedWhere(windowCutoff(window)) },
      _count: { _all: true },
    }),
    getBuilderEarnings(),
  ]);
  const newActorCounts = new Map(
    newActorGroups.map((group) => [group.username, group._count._all]),
  );

  return groups.map<AggregatedBuilder>((group) => ({
    earnings: market.builders[group.username],
    username: group.username,
    actorCount: group._count._all,
    activeUsers:
      window === 7
        ? (group._sum.users7Days ?? 0)
        : window === 90
          ? (group._sum.users90Days ?? 0)
          : (group._sum.users30Days ?? 0),
    totalUsers: group._sum.totalUsers ?? 0,
    recentRuns: group._sum.runs30Days ?? 0,
    totalRuns: group._sum.totalRuns ?? 0,
    newActorCount:
      group._count.firstPublishedAt === group._count._all
        ? (newActorCounts.get(group.username) ?? 0)
        : null,
    publicationDateCoverage: { known: group._count.firstPublishedAt, total: group._count._all },
    runCounterCoverage: { known: group._count.runs30Days, total: group._count._all },
    lastUpdatedAt: group._max.lastSeenAt ?? new Date(0),
    rank: 0,
  }));
}

// All public leaderboard variants derive from the same StoreActor aggregate.
// Cache it briefly so generating a page and its metadata does not run the
// large public-catalog group-by twice. The daily catalog sync remains the
// source of truth and naturally refreshes this cache within five minutes.
const getCachedAggregatedBuilderValues = publicCache(
  async (window: BuilderWindow) => getAggregatedBuilderValues(window),
  ["builder-aggregates-v4"],
  { revalidate: 300 },
);

async function getAggregatedBuilders(metric: BuilderMetric, window: BuilderWindow = 30) {
  const groups = await getCachedAggregatedBuilderValues(window);
  // Normalize timestamps before formatting or calculating trends.
  const normalizedGroups = groups.map((group) => ({
    ...group,
    lastUpdatedAt: new Date(group.lastUpdatedAt),
  }));
  return normalizedGroups
    .sort((a, b) => compareBuilders(a, b, metric, "desc"))
    .map((entry, index) => ({
      ...entry,
      rank: metric === "new-actors" && entry.newActorCount == null ? 0 : index + 1,
    }));
}

export async function getBuildersForComparison(
  usernames: string[],
  window: BuilderWindow = 30,
  limit = 5,
) {
  const requested = [...new Set(usernames)].slice(0, Math.min(limit, 8));
  if (!requested.length) return [];
  const [aggregates, profiles] = await Promise.all([
    getAggregatedBuilders("monthly-users", window),
    db.storeActor.findMany({
      where: { ...PUBLIC_CATALOG_ACTOR_WHERE, username: { in: requested } },
      distinct: ["username"],
      orderBy: [{ users30Days: "desc" }, { totalUsers: "desc" }],
      select: { username: true, ownerName: true, ownerPictureUrl: true },
    }),
  ]);
  const byUsername = new Map(aggregates.map((builder) => [builder.username, builder]));
  const ownerByUsername = new Map(profiles.map((profile) => [profile.username, profile]));
  return requested.flatMap((username) => {
    const aggregate = byUsername.get(username);
    const owner = ownerByUsername.get(username);
    return aggregate
      ? [
          {
            ...aggregate,
            ranks: rankMapFor(aggregate, aggregates),
            name: ownerDisplayName(owner?.ownerName, username),
            pictureUrl: owner?.ownerPictureUrl ?? null,
          },
        ]
      : [];
  });
}

export async function getBuilderComparisonHistory(usernames: string[], window: BuilderWindow) {
  const requested = [...new Set(usernames)].slice(0, 5);
  const history = new Map<string, BuilderProfile["trendChart"]>();
  if (!requested.length) return history;
  const today = startOfUtcDay(new Date());
  const where = { ...HISTORICAL_CATALOG_ACTOR_WHERE, username: { in: requested } };
  const [snapshots, actors, sync] = await Promise.all([
    db.storeActorSnapshot.findMany({
      where: { storeActor: where, capturedAt: { gte: windowCutoff(window) } },
      orderBy: { capturedAt: "asc" },
      select: {
        storeActorId: true,
        capturedAt: true,
        users30Days: true,
        runs30Days: true,
        storeActor: { select: { username: true } },
      },
    }),
    db.storeActor.findMany({
      where,
      select: { id: true, username: true, firstSeenAt: true, lastSeenAt: true },
    }),
    db.storeCatalogSync.findFirst({
      where: { operation: "SEARCH_FULL", status: "COMPLETED", completedAt: { gte: today } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
  ]);
  for (const username of requested) {
    history.set(
      username,
      buildDailyPortfolioTrends(
        snapshots.filter((snapshot) => snapshot.storeActor.username === username),
        window,
        actors
          .filter((actor) => actor.username === username)
          .map((actor) => ({
            storeActorId: actor.id,
            firstSeenAt: actor.firstSeenAt,
            lastSeenAt: actor.lastSeenAt,
          })),
        { currentDayComplete: Boolean(sync?.completedAt) },
      ),
    );
  }
  return history;
}

export async function searchBuildersForComparison(query: string, window: BuilderWindow = 30) {
  const term = query.trim().slice(0, 80);
  if (term.length < 2) return [];
  const matches = await db.storeActor.findMany({
    where: {
      ...PUBLIC_CATALOG_ACTOR_WHERE,
      username: { not: "apify" },
      OR: [{ username: { contains: term } }, { ownerName: { contains: term } }],
    },
    distinct: ["username"],
    orderBy: [{ users30Days: "desc" }, { totalUsers: "desc" }],
    take: 8,
    select: { username: true },
  });
  return getBuildersForComparison(
    matches.map((entry) => entry.username),
    window,
    8,
  );
}

export async function searchActorsForComparison(query: string, window: BuilderWindow = 30) {
  const term = query.trim().slice(0, 80);
  if (term.length < 2) return [];
  const actors = await db.storeActor.findMany({
    where: {
      ...PUBLIC_CATALOG_ACTOR_WHERE,
      OR: [
        { username: { contains: term } },
        { actorName: { contains: term } },
        { title: { contains: term } },
      ],
    },
    orderBy: [{ users30Days: "desc" }, { totalUsers: "desc" }],
    take: 8,
    select: actorCoreSelect,
  });
  return actors.map((actor) => ({
    username: actor.username,
    actor: actorEntry(actor as StoreActorRow, window),
  }));
}

function compareBuilders(
  left: AggregatedBuilder,
  right: AggregatedBuilder,
  metric: BuilderMetric,
  direction: BuilderSortDirection,
) {
  if (metric === "estimated-revenue" || metric === "new-actors") {
    const leftMissing =
      metric === "new-actors" ? left.newActorCount == null : left.earnings?.centralUsd == null;
    const rightMissing =
      metric === "new-actors" ? right.newActorCount == null : right.earnings?.centralUsd == null;
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (leftMissing) return left.username.localeCompare(right.username);
  }
  const valueDifference = metricValue(right, metric) - metricValue(left, metric);
  if (valueDifference !== 0) return direction === "desc" ? valueDifference : -valueDifference;
  return left.username.localeCompare(right.username);
}

export async function getBuilderLeaderboard(options: {
  metric: BuilderMetric;
  direction?: BuilderSortDirection;
  window?: BuilderWindow;
  query?: string;
  page?: number;
  pageSize?: number;
}) {
  const { metric, direction = "desc", window = 30, query = "", page = 1, pageSize = 20 } = options;
  const normalizedQuery = query.trim();
  const [grouped, matchingBuilders] = await Promise.all([
    getAggregatedBuilders(metric, window),
    normalizedQuery
      ? db.storeActor.findMany({
          where: {
            ...PUBLIC_CATALOG_ACTOR_WHERE,
            username: { not: "apify" },
            OR: [
              { username: { contains: normalizedQuery } },
              { actorName: { contains: normalizedQuery } },
              { title: { contains: normalizedQuery } },
              { ownerName: { contains: normalizedQuery } },
            ],
          },
          distinct: ["username"],
          select: { username: true },
        })
      : Promise.resolve(null),
  ]);
  const matchingUsernames = matchingBuilders
    ? new Set(matchingBuilders.map((builder) => builder.username))
    : null;
  const filtered = grouped
    .filter((builder) => !matchingUsernames || matchingUsernames.has(builder.username))
    .sort((left, right) => compareBuilders(left, right, metric, direction));
  const safePage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize))));
  const pageEntries = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const currentWindowStart = windowCutoff(window);
  const previousWindowStart = new Date(currentWindowStart);
  previousWindowStart.setUTCDate(previousWindowStart.getUTCDate() - window);
  const visibleUsernames = pageEntries.map((builder) => builder.username);
  const needsSnapshotHistory = [
    "monthly-users",
    "total-users",
    "monthly-runs",
    "total-runs",
  ].includes(metric);
  type PreviousBuilderAggregate = {
    username: string;
    activeUsers: bigint | number | null;
    totalUsers: bigint | number | null;
    recentRuns: bigint | number | null;
    totalRuns: bigint | number | null;
    samples: bigint | number;
  };
  const [visibleProfiles, previousAggregates, previousNewActorGroups] = await Promise.all([
    db.storeActor.findMany({
      where: { ...PUBLIC_CATALOG_ACTOR_WHERE, username: { in: visibleUsernames } },
      distinct: ["username"],
      orderBy: [{ users30Days: "desc" }, { totalUsers: "desc" }],
      select: { username: true, ownerName: true, ownerPictureUrl: true },
    }),
    needsSnapshotHistory && visibleUsernames.length
      ? db.$queryRaw<PreviousBuilderAggregate[]>(Prisma.sql`
          SELECT
            actor.username AS username,
            SUM(COALESCE(snapshot.users30Days, 0)) AS activeUsers,
            SUM(COALESCE(snapshot.totalUsers, 0)) AS totalUsers,
            SUM(COALESCE(snapshot.runs30Days, 0)) AS recentRuns,
            SUM(COALESCE(snapshot.totalRuns, 0)) AS totalRuns,
            COUNT(*) AS samples
          FROM StoreActor AS actor
          INNER JOIN StoreActorSnapshot AS snapshot
            ON snapshot.storeActorId = actor.id
          INNER JOIN (
            SELECT candidate.storeActorId, MAX(candidate.capturedAt) AS capturedAt
            FROM StoreActorSnapshot AS candidate
            INNER JOIN StoreActor AS candidateActor
              ON candidateActor.id = candidate.storeActorId
            WHERE candidate.capturedAt <= ${currentWindowStart}
              AND candidateActor.username IN (${Prisma.join(visibleUsernames)})
              AND candidateActor.isPublic = true
              AND candidateActor.isDeprecated = false
              AND candidateActor.apifyActorId NOT LIKE '%/%'
            GROUP BY candidate.storeActorId
          ) AS latest
            ON latest.storeActorId = snapshot.storeActorId
            AND latest.capturedAt = snapshot.capturedAt
          WHERE actor.username IN (${Prisma.join(visibleUsernames)})
            AND actor.isPublic = true
            AND actor.isDeprecated = false
            AND actor.apifyActorId NOT LIKE '%/%'
          GROUP BY actor.username
        `)
      : Promise.resolve([]),
    metric === "new-actors" && visibleUsernames.length
      ? db.storeActor.groupBy({
          by: ["username"],
          where: {
            username: { in: visibleUsernames },
            ...PUBLIC_CATALOG_ACTOR_WHERE,
            ...newlyPublishedWhere(previousWindowStart, currentWindowStart),
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const profiles = new Map(visibleProfiles.map((profile) => [profile.username, profile]));
  const previousNewActorCounts = new Map(
    previousNewActorGroups.map((group) => [group.username, group._count._all]),
  );
  const previousByUsername = new Map(
    previousAggregates.map((previous) => [
      previous.username,
      {
        activeUsers: Number(previous.activeUsers ?? 0),
        totalUsers: Number(previous.totalUsers ?? 0),
        recentRuns: Number(previous.recentRuns ?? 0),
        totalRuns: Number(previous.totalRuns ?? 0),
        samples: Number(previous.samples),
      },
    ]),
  );
  const items: BuilderLeaderboardEntry[] = pageEntries.map((builder) => {
    const profile = profiles.get(builder.username);
    const previous = previousByUsername.get(builder.username);
    const hasCompleteHistory = previous && previous.samples === builder.actorCount;
    return {
      ...builder,
      name: ownerDisplayName(profile?.ownerName, builder.username),
      bio: null,
      pictureUrl: profile?.ownerPictureUrl ?? null,
      changes: {
        "estimated-revenue": null,
        "new-actors":
          builder.newActorCount == null
            ? null
            : builder.newActorCount - (previousNewActorCounts.get(builder.username) ?? 0),
        actors: builder.newActorCount,
        "monthly-users":
          window === 30 && hasCompleteHistory ? builder.activeUsers - previous.activeUsers : null,
        "total-users": hasCompleteHistory ? builder.totalUsers - previous.totalUsers : null,
        "monthly-runs": hasCompleteHistory ? builder.recentRuns - previous.recentRuns : null,
        "total-runs": hasCompleteHistory ? builder.totalRuns - previous.totalRuns : null,
      },
    };
  });

  const [catalogActorCount, enrichedActorCount, latestSearchSync, latestDetailsSync] =
    await Promise.all([
      db.storeActor.count({ where: PUBLIC_CATALOG_ACTOR_WHERE }),
      db.storeActor.count({
        where: { ...PUBLIC_CATALOG_ACTOR_WHERE, detailsSyncedAt: { not: null } },
      }),
      db.storeCatalogSync.findFirst({
        where: { operation: { in: ["SEARCH", "SEARCH_FULL"] }, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
      db.storeCatalogSync.findFirst({
        where: { operation: "DETAILS", status: { in: ["COMPLETED", "PARTIAL"] } },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
    ]);

  return {
    items,
    total: filtered.length,
    totalBuilders: grouped.length,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(filtered.length / pageSize)),
    catalogActorCount,
    enrichedActorCount,
    latestSearchSyncAt: latestSearchSync?.completedAt ?? null,
    latestDetailsSyncAt: latestDetailsSync?.completedAt ?? null,
  };
}

function rankMapFor(
  builder: AggregatedBuilder,
  allBuilders: AggregatedBuilder[],
): BuilderMetricRanks {
  return Object.fromEntries(
    BUILDER_METRICS.map(({ value }) => {
      if (value === "new-actors" && builder.newActorCount == null) return [value, 0];
      const ranked = [...allBuilders].sort(
        (a, b) =>
          metricValue(b, value) - metricValue(a, value) || a.username.localeCompare(b.username),
      );
      return [value, ranked.findIndex((entry) => entry.username === builder.username) + 1];
    }),
  ) as BuilderMetricRanks;
}

function buildPublishingChart(dates: Date[], window: BuilderWindow) {
  const cutoff = windowCutoff(window);
  const points = new Map<string, number>();
  for (let index = 0; index < window; index += 1) {
    const date = new Date(cutoff);
    date.setUTCDate(cutoff.getUTCDate() + index);
    points.set(date.toISOString().slice(0, 10), 0);
  }
  for (const date of dates) {
    const key = startOfUtcDay(date).toISOString().slice(0, 10);
    if (points.has(key)) points.set(key, (points.get(key) ?? 0) + 1);
  }
  return [...points].map(([date, actors]) => ({ date, actors }));
}

function actorPortfolioOrderBy(sort: BuilderActorSort, window: BuilderWindow) {
  const activeUsersOrder =
    window === 7
      ? ({ users7Days: "desc" } as const)
      : window === 90
        ? ({ users90Days: "desc" } as const)
        : ({ users30Days: "desc" } as const);

  const orders: Record<BuilderActorSort, Prisma.StoreActorOrderByWithRelationInput[]> = {
    "active-users": [activeUsersOrder, { totalUsers: "desc" }, { actorName: "asc" }],
    "runs-30d": [{ runs30Days: "desc" }, { totalRuns: "desc" }, { actorName: "asc" }],
    "total-users": [{ totalUsers: "desc" }, activeUsersOrder, { actorName: "asc" }],
    "total-runs": [{ totalRuns: "desc" }, { runs30Days: "desc" }, { actorName: "asc" }],
    rating: [{ reviewRating: "desc" }, { reviewCount: "desc" }, { actorName: "asc" }],
    newest: [{ firstPublishedAt: "desc" }, { actorName: "asc" }],
    name: [{ title: "asc" }, { actorName: "asc" }],
  };
  return orders[sort];
}

function buildDailyActorTrend(points: SnapshotPoint[], window: BuilderWindow) {
  const latestByDay = new Map<string, SnapshotPoint>();
  for (const point of points) {
    const key = startOfUtcDay(point.capturedAt).toISOString().slice(0, 10);
    const current = latestByDay.get(key);
    if (!current || point.capturedAt >= current.capturedAt) latestByDay.set(key, point);
  }
  const cutoff = windowCutoff(window);
  return Array.from({ length: window }, (_, index) => {
    const date = new Date(cutoff);
    date.setUTCDate(cutoff.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const observed = latestByDay.get(key);
    return {
      date: key,
      observed: Boolean(observed),
      // Catalog snapshots are rolling metrics. Carrying a value forward makes
      // missing days look observed and renders a misleading chart. Leave
      // unobserved days blank until the next real daily snapshot is persisted.
      users: observed?.activeUsers ?? null,
      runs: observed?.runs30d ?? null,
      totalUsers: observed?.totalUsers ?? 0,
      totalRuns: observed?.totalRuns ?? 0,
    };
  });
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
  const window = options.window ?? 30;
  const actorPageSize = options.actorPageSize ?? 24;
  const actorQuery = options.actorQuery?.trim().slice(0, 100) ?? "";
  const actorCategory = options.actorCategory?.trim().slice(0, 80) ?? "";
  const actorSort = options.actorSort ?? "active-users";
  const allBuilders = await getAggregatedBuilders("monthly-users", window);
  const aggregate = allBuilders.find((entry) => entry.username === username);
  // Official Apify portfolios are outside the builder leaderboard's scope.
  if (!aggregate && username === "apify") return null;

  const cutoff = windowCutoff(window);
  const actorWhere: Prisma.StoreActorWhereInput = {
    username,
    ...PUBLIC_CATALOG_ACTOR_WHERE,
    ...(actorQuery
      ? {
          OR: [
            { actorName: { contains: actorQuery } },
            { title: { contains: actorQuery } },
            { description: { contains: actorQuery } },
          ],
        }
      : {}),
    ...(actorCategory ? { categories: { array_contains: actorCategory } } : {}),
  };
  const currentCatalogDay = startOfUtcDay(new Date());
  const [
    actorTotal,
    categoryRows,
    profileActor,
    publicationRows,
    actorConsoleEvents,
    snapshotRows,
    latestFullCatalogSync,
    trendActors,
  ] = await Promise.all([
    db.storeActor.count({ where: actorWhere }),
    db.storeActor.findMany({
      where: { username, ...PUBLIC_CATALOG_ACTOR_WHERE },
      select: { categories: true },
    }),
    db.storeActor.findFirst({
      where: { username, ...HISTORICAL_CATALOG_ACTOR_WHERE },
      orderBy: [{ isPublic: "desc" }, { users30Days: "desc" }, { totalUsers: "desc" }],
      select: { ownerName: true, ownerPictureUrl: true },
    }),
    db.storeActor.findMany({
      where: {
        username,
        ...HISTORICAL_CATALOG_ACTOR_WHERE,
        ...newlyPublishedWhere(cutoff),
      },
      select: { firstPublishedAt: true },
    }),
    db.actorPublicationEvent.findMany({
      where: { username, publishedAt: { gte: cutoff } },
      select: { publishedAt: true },
    }),
    db.storeActorSnapshot.findMany({
      where: {
        storeActor: { username, ...HISTORICAL_CATALOG_ACTOR_WHERE },
        capturedAt: { gte: cutoff },
      },
      orderBy: { capturedAt: "asc" },
      select: {
        storeActorId: true,
        capturedAt: true,
        users30Days: true,
        runs30Days: true,
      },
    }),
    db.storeCatalogSync.findFirst({
      where: {
        operation: "SEARCH_FULL",
        status: "COMPLETED",
        completedAt: { gte: currentCatalogDay },
      },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    db.storeActor.findMany({
      where: {
        username,
        ...HISTORICAL_CATALOG_ACTOR_WHERE,
      },
      select: { id: true, firstSeenAt: true, lastSeenAt: true, firstPublishedAt: true },
    }),
  ]);

  if (!aggregate && !profileActor) return null;

  const actorPageCount = Math.max(1, Math.ceil(actorTotal / actorPageSize));
  const actorPage = Math.max(1, Math.min(options.actorPage ?? 1, actorPageCount));
  const actors = await db.storeActor.findMany({
    where: actorWhere,
    orderBy: actorPortfolioOrderBy(actorSort, window),
    skip: (actorPage - 1) * actorPageSize,
    take: actorPageSize,
    select: actorCoreSelect,
  });
  const actorCategories = [
    ...new Set(categoryRows.flatMap((actor) => jsonStringArray(actor.categories))),
  ].sort((left, right) => left.localeCompare(right));
  const trendChart = buildDailyPortfolioTrends(
    snapshotRows,
    window,
    trendActors.map((actor) => ({
      storeActorId: actor.id,
      firstSeenAt: actor.firstSeenAt,
      lastSeenAt: actor.lastSeenAt,
    })),
    { currentDayComplete: Boolean(latestFullCatalogSync?.completedAt) },
  );
  const validUserTrends = trendChart.filter(
    (point): point is typeof point & { users: number } =>
      point.observed &&
      point.users != null &&
      point.usersCoverage.known === point.usersCoverage.total,
  );
  const validRunTrends = trendChart.filter(
    (point): point is typeof point & { runs: number } =>
      point.observed && point.runs != null && point.runsCoverage.known === point.runsCoverage.total,
  );
  const firstUserTrend = validUserTrends[0];
  const lastUserTrend = validUserTrends.at(-1);
  const firstRunTrend = validRunTrends[0];
  const lastRunTrend = validRunTrends.at(-1);
  const currentObservationDate = aggregate?.lastUpdatedAt.toISOString().slice(0, 10);

  return {
    username,
    isAvailable: Boolean(aggregate),
    earnings: aggregate?.earnings,
    name: ownerDisplayName(profileActor?.ownerName, username),
    bio: null,
    pictureUrl: profileActor?.ownerPictureUrl ?? null,
    apifyUrl: `https://apify.com/${username}`,
    actorCount: aggregate?.actorCount ?? 0,
    activeUsers: aggregate?.activeUsers ?? 0,
    totalUsers: aggregate?.totalUsers ?? 0,
    recentRuns: aggregate?.recentRuns ?? 0,
    totalRuns: aggregate?.totalRuns ?? 0,
    newActorCount: aggregate ? aggregate.newActorCount : null,
    runCounterCoverage: aggregate?.runCounterCoverage,
    publicationDateCoverage: {
      known: trendActors.filter((actor) => actor.firstPublishedAt != null).length,
      total: trendActors.length,
    },
    ranks: aggregate
      ? rankMapFor(aggregate, allBuilders)
      : (Object.fromEntries(BUILDER_METRICS.map(({ value }) => [value, 0])) as BuilderMetricRanks),
    totalBuilders: allBuilders.length,
    lastUpdatedAt:
      aggregate?.lastUpdatedAt ??
      trendActors.reduce(
        (latest, actor) => (actor.lastSeenAt > latest ? actor.lastSeenAt : latest),
        new Date(0),
      ),
    window,
    publishingChart: buildPublishingChart(
      publicationRows.flatMap((actor) => (actor.firstPublishedAt ? [actor.firstPublishedAt] : [])),
      window,
    ),
    discoveryChart: buildPublishingChart(
      trendActors.map((actor) => actor.firstSeenAt),
      window,
    ),
    actorConsolePublishingChart: buildPublishingChart(
      actorConsoleEvents.map((event) => event.publishedAt),
      window,
    ),
    trendChart,
    actors: actors.map((actor) => actorEntry(actor as StoreActorRow, window)),
    actorPage,
    actorPageCount,
    actorTotal,
    actorCategories,
    actorFilters: {
      query: actorQuery,
      category: actorCategory,
      sort: actorSort,
    },
    changes: {
      users:
        window === 30 &&
        firstUserTrend &&
        lastUserTrend &&
        lastUserTrend.date === currentObservationDate &&
        lastUserTrend.users === aggregate?.activeUsers &&
        firstUserTrend.date !== lastUserTrend.date
          ? lastUserTrend.users - firstUserTrend.users
          : null,
      runs:
        firstRunTrend &&
        lastRunTrend &&
        lastRunTrend.date === currentObservationDate &&
        lastRunTrend.runs === aggregate?.recentRuns &&
        firstRunTrend.date !== lastRunTrend.date
          ? lastRunTrend.runs - firstRunTrend.runs
          : null,
    },
  };
}

export async function getBuilderActorDetail(
  username: string,
  actorName: string,
  window: BuilderWindow = 30,
): Promise<BuilderActorDetail | null> {
  const actor = await db.storeActor.findFirst({
    where: { username, actorName, ...HISTORICAL_CATALOG_ACTOR_WHERE },
    select: actorSelect,
  });
  if (!actor) return null;

  // The persisted catalog keeps discovery and leaderboards fast. Actor detail
  // pages additionally read the public Store record so the visible title,
  // metrics, pricing, and review summary all use the same current source as
  // the README/schema/reviews panel below. `getPublicActor` is Redis-cached
  // for five minutes, so this does not turn normal page views into an API
  // crawl. If the Store is unavailable, the durable catalog record remains a
  // complete fallback.
  const isAvailable = actor.isPublic && !actor.isDeprecated;
  const [publicActor, storeRating] = isAvailable
    ? await Promise.all([
        optionalWithin(getPublicActor(`${username}/${actorName}`), 3_000),
        optionalWithin(getPublicActorStoreRating(username, actorName), 3_000),
      ])
    : [null, null];

  const activeUsersOrder =
    window === 7
      ? ({ users7Days: "desc" } as const)
      : window === 90
        ? ({ users90Days: "desc" } as const)
        : ({ users30Days: "desc" } as const);

  const related = await db.storeActor.findMany({
    where: { username, ...PUBLIC_CATALOG_ACTOR_WHERE, id: { not: actor.id } },
    orderBy: [activeUsersOrder, { totalUsers: "desc" }],
    take: 4,
    select: actorCoreSelect,
  });
  const snapshots = toSnapshotPoints(actor as StoreActorRow).sort(
    (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime(),
  );
  const base = actorEntry(actor as StoreActorRow, window);
  const publicStats = publicActor?.stats;
  const liveUsersForWindow =
    window === 7
      ? publicStats?.totalUsers7Days
      : window === 90
        ? publicStats?.totalUsers90Days
        : publicStats?.totalUsers30Days;
  const livePricing = publicActor?.pricingInfos as Prisma.JsonValue | undefined;
  const storedTrend = buildDailyActorTrend(snapshots, window);
  const currentUsers30Days = publicStats?.totalUsers30Days ?? actor.users30Days;
  const currentRuns30Days = publicStats?.publicActorRunStats30Days?.TOTAL ?? actor.runs30Days;

  return {
    ...base,
    isAvailable,
    earnings: isAvailable
      ? estimateActorEarnings({
          pricingInfos: livePricing ?? actor.pricingInfos,
          runs30Days: currentRuns30Days,
          users30Days: currentUsers30Days,
        })
      : undefined,
    title: publicActor?.title ?? base.title,
    description: publicActor?.description ?? base.description,
    pictureUrl: publicActor?.pictureUrl ?? base.pictureUrl,
    activeUsers:
      window === 30 ? (currentUsers30Days ?? 0) : (liveUsersForWindow ?? base.activeUsers),
    users7Days: publicStats?.totalUsers7Days ?? base.users7Days,
    users30Days: currentUsers30Days ?? 0,
    users90Days: publicStats?.totalUsers90Days ?? base.users90Days,
    totalUsers: publicStats?.totalUsers ?? publicActor?.totalUsers ?? base.totalUsers,
    runs30Days: currentRuns30Days ?? 0,
    totalRuns: publicStats?.totalRuns ?? publicActor?.totalRuns ?? base.totalRuns,
    rating:
      storeRating?.rating ??
      publicStats?.actorReviewRating ??
      publicActor?.reviewRating ??
      base.rating,
    reviewCount:
      storeRating?.reviewCount ??
      publicStats?.actorReviewCount ??
      publicActor?.reviewCount ??
      base.reviewCount,
    username,
    ownerName: ownerDisplayName(publicActor?.userFullName ?? actor.ownerName, username),
    ownerPictureUrl: publicActor?.userPictureUrl ?? actor.ownerPictureUrl,
    apifyActorId: actor.apifyActorId,
    createdAt: publicActor?.createdAt ? new Date(publicActor.createdAt) : actor.apifyCreatedAt,
    modifiedAt: publicActor?.modifiedAt ? new Date(publicActor.modifiedAt) : actor.apifyModifiedAt,
    firstSeenAt: actor.firstSeenAt,
    lastSeenAt: actor.lastSeenAt,
    detailsSyncedAt: actor.detailsSyncError ? null : actor.detailsSyncedAt,
    bookmarks: publicStats?.bookmarkCount ?? actor.bookmarkCount ?? 0,
    categories: publicActor?.categories ?? jsonStringArray(actor.categories),
    metaLabels: publicActor?.metaLabels ?? jsonStringArray(actor.metaLabels),
    pricing: pricingEntries(livePricing ?? actor.pricingInfos),
    trend: storedTrend,
    relatedActors: related.map((item) => actorEntry(item as StoreActorRow, window)),
  };
}
