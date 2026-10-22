import type { EarningsRollup } from "@actorconsole/shared/actor-earnings";
import type {
  BuilderActorEntry,
  BuilderActorDetail,
  BuilderActorPricing,
  BuilderLeaderboardEntry,
  BuilderProfile,
  BuilderWindow,
  BuilderMetric,
} from "@/lib/builders";
import type { ComparisonItem, ComparisonRow } from "./comparison-ui";
import { publicComparisonHref } from "./comparison-paths";

export type PublicCompareKind = "builder" | "actor";

export interface PublicCompareItem extends ComparisonItem {
  kind: PublicCompareKind;
  username: string;
  actorName?: string;
  window: BuilderWindow;
  history?: Array<{ date: string; users: number | null; runs: number | null }>;
}

export const builderComparisonRows: ComparisonRow[] = [
  { key: "earningsLow", label: "Low estimate / 30d", group: "Earnings", format: "currency" },
  {
    key: "earningsCentral",
    label: "Central estimate / 30d",
    group: "Earnings",
    format: "currency",
  },
  { key: "earningsHigh", label: "High estimate / 30d", group: "Earnings", format: "currency" },
  { key: "earningsCoverage", label: "Actors covered", group: "Earnings", format: "text" },
  {
    key: "earningsMinimum",
    label: "Minimum per Actor / 30d",
    group: "Earnings",
    format: "currency",
  },
  {
    key: "earningsAverage",
    label: "Average per Actor / 30d",
    group: "Earnings",
    format: "currency",
  },
  {
    key: "earningsMaximum",
    label: "Maximum per Actor / 30d",
    group: "Earnings",
    format: "currency",
  },
  { key: "actorCount", label: "Published Actors", group: "Portfolio", better: "higher" },
  { key: "newActorCount", label: "New Actors in period", group: "Portfolio", better: "higher" },
  { key: "activeUsers", label: "Active users in period", group: "Audience", better: "higher" },
  { key: "totalUsers", label: "Total users", group: "Audience", better: "higher" },
  { key: "recentRuns", label: "Runs / 30d", group: "Activity", better: "higher" },
  { key: "totalRuns", label: "Total runs", group: "Activity", better: "higher" },
  { key: "rank", label: "Active-user rank", group: "Standing", better: "lower" },
  { key: "earningsRank", label: "Revenue rank (central)", group: "Standing", better: "lower" },
  { key: "lastUpdated", label: "Catalog updated", group: "Standing", format: "text" },
];

export const actorComparisonRows: ComparisonRow[] = [
  { key: "earningsLow", label: "Low estimate / 30d", group: "Earnings", format: "currency" },
  {
    key: "earningsCentral",
    label: "Central estimate / 30d",
    group: "Earnings",
    format: "currency",
  },
  { key: "earningsHigh", label: "High estimate / 30d", group: "Earnings", format: "currency" },
  { key: "earningsReason", label: "Estimate coverage", group: "Earnings", format: "text" },
  { key: "description", label: "What it does", group: "Listing", format: "text" },
  { key: "categories", label: "Categories", group: "Listing", format: "tags" },
  { key: "pricingModel", label: "Pricing model", group: "Pricing", format: "text" },
  { key: "priceSummary", label: "Published price", group: "Pricing", format: "text" },
  { key: "trial", label: "Free trial", group: "Pricing", format: "text" },
  { key: "activeUsers", label: "Active users in period", group: "Usage", better: "higher" },
  { key: "users7Days", label: "Users / 7d", group: "Usage", better: "higher" },
  { key: "users30Days", label: "Users / 30d", group: "Usage", better: "higher" },
  { key: "users90Days", label: "Users / 90d", group: "Usage", better: "higher" },
  { key: "totalUsers", label: "Total users", group: "Usage", better: "higher" },
  { key: "runs30Days", label: "Runs / 30d", group: "Usage", better: "higher" },
  { key: "totalRuns", label: "Total runs", group: "Usage", better: "higher" },
  { key: "rating", label: "Rating", group: "Trust", format: "rating", better: "higher" },
  { key: "reviewCount", label: "Reviews", group: "Trust", better: "higher" },
  { key: "bookmarks", label: "Bookmarks", group: "Trust", better: "higher" },
  { key: "firstPublished", label: "First published", group: "History", format: "text" },
  { key: "lastSeen", label: "Last seen in Store", group: "History", format: "text" },
];

type BuilderCompareSource = Pick<
  BuilderLeaderboardEntry | BuilderProfile,
  | "username"
  | "name"
  | "pictureUrl"
  | "actorCount"
  | "newActorCount"
  | "activeUsers"
  | "totalUsers"
  | "recentRuns"
  | "totalRuns"
  | "lastUpdatedAt"
> & { rank?: number; ranks?: BuilderProfile["ranks"]; earnings?: EarningsRollup };

function comparisonDate(value: Date | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" }) : null;
}

function pricingDetails(pricing: BuilderActorPricing[] | undefined) {
  const current = pricing?.find((entry) => entry.model === "PAY_PER_EVENT") ?? pricing?.[0];
  if (!current) return { model: null, summary: null, trial: null };
  const model =
    current.model === "UNKNOWN"
      ? null
      : current.model
          .replaceAll("_", " ")
          .toLowerCase()
          .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  const event =
    current.events.find((entry) => entry.isPrimary && entry.priceUsd != null) ??
    current.events.find((entry) => entry.priceUsd != null);
  const amount = event?.priceUsd ?? current.pricePerUnitUsd;
  const unit = event?.title ?? current.unitName;
  return {
    model,
    trial: current.trialMinutes ? `${current.trialMinutes} minutes` : null,
    summary:
      amount == null
        ? null
        : `$${amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}${unit ? ` / ${unit}` : ""}`,
  };
}

export function builderCompareItem(
  builder: BuilderCompareSource,
  window: BuilderWindow = 30,
  rankMetric: BuilderMetric = "monthly-users",
): PublicCompareItem {
  return {
    kind: "builder",
    id: builder.username,
    username: builder.username,
    window,
    title: builder.name ?? builder.username,
    subtitle: `@${builder.username}`,
    href: `/builders/${encodeURIComponent(builder.username)}?window=${window}`,
    imageUrl: builder.pictureUrl,
    metrics: {
      earningsLow: builder.earnings?.lowUsd ?? null,
      earningsCentral: builder.earnings?.centralUsd ?? null,
      earningsHigh: builder.earnings?.highUsd ?? null,
      earningsCoverage: builder.earnings
        ? `${builder.earnings.coveredActors}/${builder.earnings.totalActors} Actors; totals include covered Actors only`
        : null,
      earningsMinimum: builder.earnings?.minimumActorUsd ?? null,
      earningsAverage: builder.earnings?.averageActorUsd ?? null,
      earningsMaximum: builder.earnings?.maximumActorUsd ?? null,
      actorCount: builder.actorCount,
      newActorCount: builder.newActorCount,
      activeUsers: builder.activeUsers,
      totalUsers: builder.totalUsers,
      recentRuns: builder.recentRuns,
      totalRuns: builder.totalRuns,
      rank:
        builder.ranks?.["monthly-users"] ??
        (rankMetric === "monthly-users" ? (builder.rank ?? null) : null),
      earningsRank:
        builder.earnings?.centralUsd != null
          ? (builder.ranks?.["estimated-revenue"] ??
            (rankMetric === "estimated-revenue" ? (builder.rank ?? null) : null))
          : null,
      lastUpdated: comparisonDate(builder.lastUpdatedAt),
    },
  };
}

export function actorCompareItem(
  username: string,
  actor: Pick<
    BuilderActorEntry,
    | "name"
    | "title"
    | "description"
    | "pictureUrl"
    | "activeUsers"
    | "users7Days"
    | "users30Days"
    | "users90Days"
    | "totalUsers"
    | "runs30Days"
    | "totalRuns"
    | "rating"
    | "reviewCount"
    | "firstPublishedAt"
  > &
    Partial<
      Pick<
        BuilderActorDetail,
        "categories" | "pricing" | "lastSeenAt" | "bookmarks" | "earnings" | "trend"
      >
    >,
  window: BuilderWindow = 30,
): PublicCompareItem {
  const pricing = pricingDetails(actor.pricing);
  return {
    kind: "actor",
    id: `${username}/${actor.name}`,
    username,
    window,
    actorName: actor.name,
    title: actor.title,
    subtitle: `@${username}/${actor.name}`,
    href: `/builders/${encodeURIComponent(username)}/actors/${encodeURIComponent(actor.name)}?window=${window}`,
    imageUrl: actor.pictureUrl,
    history: actor.trend?.map((point) => ({
      date: point.date,
      users: point.observed ? point.users : null,
      runs: point.observed ? point.runs : null,
    })),
    metrics: {
      earningsLow: actor.earnings?.lowUsd ?? null,
      earningsCentral: actor.earnings?.centralUsd ?? null,
      earningsHigh: actor.earnings?.highUsd ?? null,
      earningsReason:
        actor.earnings?.reason ??
        (actor.earnings ? "Public scenarios before costs" : "Unavailable"),
      description: actor.description,
      categories: actor.categories?.length ? actor.categories : null,
      pricingModel: pricing.model,
      priceSummary: pricing.summary,
      trial: pricing.trial,
      activeUsers: actor.activeUsers,
      users7Days: actor.users7Days,
      users30Days: actor.users30Days,
      users90Days: actor.users90Days,
      totalUsers: actor.totalUsers,
      runs30Days: actor.runs30Days,
      totalRuns: actor.totalRuns,
      rating: actor.rating,
      reviewCount: actor.reviewCount,
      bookmarks: actor.bookmarks ?? null,
      firstPublished: comparisonDate(actor.firstPublishedAt),
      lastSeen: comparisonDate(actor.lastSeenAt),
    },
  };
}

export { publicComparisonHref };
