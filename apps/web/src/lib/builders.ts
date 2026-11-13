import { backendData } from "./backend-data";
import type {
  BuilderActorDetail,
  BuilderActorEntry,
  BuilderActorSort,
  BuilderLeaderboardEntry,
  BuilderMetric,
  BuilderMetricRanks,
  BuilderProfile,
  BuilderSortDirection,
  BuilderWindow,
} from "@actorconsole/shared/builders";

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
