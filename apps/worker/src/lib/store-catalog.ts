import { db, Prisma } from "@actorconsole/db";
import { ApifyClientError } from "@actorconsole/apify";
import type {
  ApifyActorBasicInfo,
  ApifyActorDetail,
  ApifyClientWrapper,
  ApifyStoreSearchResult,
} from "@actorconsole/apify";
import { reconcileStoreActorIdentity } from "./store-catalog-identity.js";

type StoreCatalogDatabase = Pick<
  typeof db,
  "storeActor" | "storeActorSnapshot" | "storeCatalogSync" | "$transaction"
>;

export interface StoreCatalogSyncResult {
  expectedCount: number | null;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
}

type ProgressCallback = (result: StoreCatalogSyncResult) => void | Promise<void>;
type FetchImplementation = typeof fetch;

/**
 * The catalog needs one complete Store search every UTC day. This check is
 * deliberately based on both the search run and the rows it persisted: a
 * completed job without snapshots is not enough to show trustworthy daily
 * builder charts.
 */
export function needsDailyStoreCatalogCatchup(input: {
  now?: Date;
  latestSearchCompletedAt: Date | null;
  latestSnapshotAt: Date | null;
  snapshotCount: number;
  catalogActorCount: number;
}) {
  const now = input.now ?? new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return (
    !input.latestSearchCompletedAt ||
    input.latestSearchCompletedAt < today ||
    !input.latestSnapshotAt ||
    input.latestSnapshotAt < today ||
    input.catalogActorCount === 0 ||
    input.snapshotCount < input.catalogActorCount
  );
}

function dateOrNull(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null ? Prisma.JsonNull : (value as unknown as Prisma.InputJsonValue);
}

function actorRefsFromSitemap(xml: string) {
  const actors = new Map<string, { username: string; actorName: string }>();
  for (const match of xml.matchAll(/<loc>https:\/\/apify\.com\/([^/<>]+)\/([^?/#<>]+)<\/loc>/g)) {
    const username = decodeURIComponent(match[1]);
    const actorName = decodeURIComponent(match[2]);
    actors.set(`${username}/${actorName}`, { username, actorName });
  }
  return actors;
}

function actorRef(username: string, actorName: string) {
  return `${username}/${actorName}`.toLocaleLowerCase();
}

async function discoverSitemapActors(fetchImpl: FetchImplementation) {
  const indexResponse = await fetchImpl("https://apify.com/sitemap.xml");
  if (!indexResponse.ok) {
    throw new Error(`Apify sitemap index returned HTTP ${indexResponse.status}`);
  }
  const index = await indexResponse.text();
  const sitemapUrls = [
    ...index.matchAll(/<loc>(https:\/\/apify\.com\/sitemap\/actors\d+\.xml)<\/loc>/g),
  ].map((match) => match[1]);
  const sitemapResponses = await Promise.all(sitemapUrls.map((url) => fetchImpl(url)));
  const actors = new Map<string, { username: string; actorName: string }>();
  for (const response of sitemapResponses) {
    if (!response.ok) throw new Error(`Apify Actor sitemap returned HTTP ${response.status}`);
    for (const [key, actor] of actorRefsFromSitemap(await response.text())) {
      actors.set(key, actor);
    }
  }
  return actors;
}

function searchActorData(actor: ApifyStoreSearchResult, now: Date) {
  const apifyCreatedAt = dateOrNull(actor.createdAt);
  const firstPublishedAt = dateOrNull(actor.firstPublishedAt);
  const apifyModifiedAt = dateOrNull(actor.modifiedAt);
  return {
    username: actor.username,
    actorName: actor.name,
    title: actor.title,
    description: actor.description,
    pictureUrl: actor.pictureUrl,
    ownerName: actor.userFullName ?? null,
    ownerPictureUrl: actor.userPictureUrl ?? null,
    isPublic: true,
    totalRuns: actor.stats?.totalRuns ?? actor.totalRuns ?? null,
    totalUsers: actor.stats?.totalUsers ?? actor.totalUsers ?? null,
    users7Days: actor.stats?.totalUsers7Days ?? null,
    users30Days: actor.stats?.totalUsers30Days ?? actor.stats?.monthlyUsers ?? null,
    users90Days: actor.stats?.totalUsers90Days ?? null,
    runs30Days: actor.stats?.publicActorRunStats30Days?.TOTAL ?? null,
    reviewCount: actor.stats?.actorReviewCount ?? actor.reviewCount ?? null,
    reviewRating: actor.stats?.actorReviewRating ?? actor.reviewRating ?? null,
    bookmarkCount: actor.stats?.bookmarkCount ?? null,
    categories: jsonOrNull(actor.categories),
    metaLabels: jsonOrNull(actor.metaLabelDetails ?? actor.metaLabels),
    pricingInfos: jsonOrNull(actor.pricingInfos),
    ...(apifyCreatedAt ? { apifyCreatedAt } : {}),
    ...(firstPublishedAt ? { firstPublishedAt } : {}),
    ...(apifyModifiedAt ? { apifyModifiedAt } : {}),
    lastSeenAt: now,
  };
}

function detailActorData(detail: ApifyActorBasicInfo | ApifyActorDetail, now: Date) {
  const stats = detail.stats;
  const publicOwnerProfile = "publicOwnerProfile" in detail ? detail.publicOwnerProfile : undefined;
  const apifyCreatedAt = dateOrNull(detail.createdAt);
  const firstPublishedAt = dateOrNull(
    "firstPublishedAt" in detail ? detail.firstPublishedAt : undefined,
  );
  const apifyModifiedAt = dateOrNull(detail.modifiedAt);
  return {
    username: detail.username ?? "unknown",
    actorName: detail.name ?? detail.id ?? "actor",
    title: detail.title ?? null,
    description: detail.description ?? null,
    pictureUrl: detail.pictureUrl ?? null,
    ...(publicOwnerProfile?.name || publicOwnerProfile?.displayName
      ? { ownerName: publicOwnerProfile.name ?? publicOwnerProfile.displayName ?? null }
      : {}),
    ...(publicOwnerProfile?.pictureUrl ? { ownerPictureUrl: publicOwnerProfile.pictureUrl } : {}),
    isPublic: detail.isPublic ?? true,
    isDeprecated: detail.isDeprecated ?? false,
    ...(apifyCreatedAt ? { apifyCreatedAt } : {}),
    ...(firstPublishedAt ? { firstPublishedAt } : {}),
    ...(apifyModifiedAt ? { apifyModifiedAt } : {}),
    totalRuns: stats?.totalRuns ?? null,
    totalUsers: stats?.totalUsers ?? null,
    users7Days: stats?.totalUsers7Days ?? null,
    users30Days: stats?.totalUsers30Days ?? stats?.monthlyUsers ?? null,
    users90Days: stats?.totalUsers90Days ?? null,
    runs30Days: stats?.publicActorRunStats30Days?.TOTAL ?? null,
    reviewCount: stats?.actorReviewCount ?? null,
    reviewRating: stats?.actorReviewRating ?? stats?.rating ?? null,
    bookmarkCount: stats?.bookmarkCount ?? null,
    categories: jsonOrNull(detail.categories),
    metaLabels: jsonOrNull(detail.metaLabels),
    pricingInfos: jsonOrNull(detail.pricingInfos),
    detailsSyncedAt: now,
    detailsSyncError: null,
  };
}

function startOfUtcDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function persistSearchActorBatch(
  database: StoreCatalogDatabase,
  items: ApifyStoreSearchResult[],
  now: Date,
) {
  const existingRows = await database.storeActor.findMany({
    where: {
      OR: [
        { apifyActorId: { in: items.map((actor) => actor.id) } },
        { username: { in: [...new Set(items.map((actor) => actor.username))] } },
      ],
    },
    select: { id: true, apifyActorId: true, username: true, actorName: true },
  });
  const existingById = new Map(existingRows.map((actor) => [actor.apifyActorId, actor]));
  const existingByRef = new Map(
    existingRows.map((actor) => [actorRef(actor.username, actor.actorName), actor]),
  );
  const matches = items.map((actor) => {
    const byId = existingById.get(actor.id);
    const byRef = existingByRef.get(actorRef(actor.username, actor.name));
    return {
      actor,
      // Immutable IDs own metrics and histories. A reused name must never
      // redirect one Actor's metrics onto a different real Actor.
      existing: byId ?? (byRef?.apifyActorId.includes("/") ? byRef : undefined),
      identityConflict: Boolean(byId && byRef && byId.id !== byRef.id),
    };
  });
  const newActors = matches.filter((match) => !match.existing).map((match) => match.actor);
  const existingActors = matches.filter(
    (match): match is typeof match & { existing: NonNullable<typeof match.existing> } =>
      Boolean(match.existing),
  );

  await database.storeActor.createMany({
    data: newActors.map((actor) => ({
      apifyActorId: actor.id,
      ...searchActorData(actor, now),
    })),
    skipDuplicates: true,
  });
  if (existingActors.length > 0) {
    await database.$transaction(
      existingActors.map(({ actor, existing, identityConflict }) =>
        database.storeActor.update({
          where: { id: existing.id },
          data: {
            ...searchActorData(actor, now),
            apifyActorId: actor.id,
            // Details verify and reconcile occupied names separately.
            ...(identityConflict ? { username: existing.username, actorName: existing.actorName } : {}),
          },
        }),
      ),
    );
  }

  const createdRows = newActors.length
    ? await database.storeActor.findMany({
        where: { apifyActorId: { in: newActors.map((actor) => actor.id) } },
        select: { id: true, apifyActorId: true, username: true, actorName: true },
      })
    : [];
  const persistedById = new Map(
    [...existingRows, ...createdRows].map((actor) => [actor.apifyActorId, actor]),
  );
  const persistedByRef = new Map(
    [...existingRows, ...createdRows].map((actor) => [
      actorRef(actor.username, actor.actorName),
      actor,
    ]),
  );
  const capturedAt = startOfUtcDay(now);
  const snapshots = items.flatMap((actor) => {
    const byRef = persistedByRef.get(actorRef(actor.username, actor.name));
    const row = persistedById.get(actor.id) ??
      (byRef?.apifyActorId === actor.id || byRef?.apifyActorId.includes("/") ? byRef : undefined);
    if (!row) return [];
    const data = searchActorData(actor, now);
    return [
      database.storeActorSnapshot.upsert({
        where: { storeActorId_capturedAt: { storeActorId: row.id, capturedAt } },
        create: {
          storeActorId: row.id,
          capturedAt,
          totalRuns: data.totalRuns,
          totalUsers: data.totalUsers,
          users30Days: data.users30Days,
          runs30Days: data.runs30Days,
          reviewCount: data.reviewCount,
          reviewRating: data.reviewRating,
        },
        update: {
          totalRuns: data.totalRuns,
          totalUsers: data.totalUsers,
          users30Days: data.users30Days,
          runs30Days: data.runs30Days,
          reviewCount: data.reviewCount,
          reviewRating: data.reviewRating,
        },
      }),
    ];
  });
  for (let offset = 0; offset < snapshots.length; offset += 250) {
    await database.$transaction(snapshots.slice(offset, offset + 250));
  }

  return { createdCount: newActors.length, updatedCount: existingActors.length };
}

async function createSyncRun(database: StoreCatalogDatabase, operation: string) {
  return database.storeCatalogSync.create({
    data: { operation, status: "RUNNING" },
  });
}

async function failSyncRun(
  database: StoreCatalogDatabase,
  syncId: string,
  error: unknown,
  result: StoreCatalogSyncResult,
) {
  await database.storeCatalogSync.update({
    where: { id: syncId },
    data: {
      status: "FAILED",
      expectedCount: result.expectedCount,
      processedCount: result.processedCount,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      error: error instanceof Error ? error.message : "Unknown Store catalog sync error",
      completedAt: new Date(),
    },
  });
}

export async function syncStoreSearchCatalog(
  apify: ApifyClientWrapper,
  options: {
    /** Restrict the public Store crawl to one builder username. */
    builderUsername?: string;
    maxActors?: number;
    startOffset?: number;
    pageSize?: number;
    completeCatalog?: boolean;
    reconcileBuilders?: boolean;
    builderConcurrency?: number;
    builderBatchDelayMs?: number;
    maxBuilders?: number;
    fetchImpl?: FetchImplementation;
    database?: StoreCatalogDatabase;
    onProgress?: ProgressCallback;
  } = {},
): Promise<StoreCatalogSyncResult> {
  const database = options.database ?? db;
  const completeCatalog = options.completeCatalog ?? false;
  const pageSize = Math.min(
    Math.max(options.pageSize ?? (completeCatalog ? 1_000 : 100), 1),
    completeCatalog ? 1_000 : 100,
  );
  const maxActors = Math.max(options.maxActors ?? Number.POSITIVE_INFINITY, 0);
  const startOffset = Math.max(options.startOffset ?? 0, 0);
  const builderUsername = options.builderUsername?.trim().toLocaleLowerCase() ?? "";
  // Keep full public catalog passes distinct from targeted builder refreshes.
  // A successful Crawler Bros refresh must never make the daily global
  // leaderboard think its 60k-Actor snapshot is complete.
  const run = await createSyncRun(database, completeCatalog ? "SEARCH_FULL" : "SEARCH");
  const result: StoreCatalogSyncResult = {
    expectedCount: null,
    processedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    failedCount: 0,
  };
  // A full reconciliation can run for several minutes. Persist bounded
  // progress updates so the dashboard does not show an active job as 0/0,
  // while avoiding a database write for every small builder response.
  let lastPersistedProgress = -1;
  let lastProgressAt = 0;
  const reportProgress = async () => {
    const now = Date.now();
    const shouldPersist =
      lastPersistedProgress < 0 ||
      result.processedCount - lastPersistedProgress >= 1_000 ||
      now - lastProgressAt >= 15_000;
    if (shouldPersist) {
      await database.storeCatalogSync.update({
        where: { id: run.id },
        data: {
          status: "RUNNING",
          expectedCount: result.expectedCount,
          processedCount: result.processedCount,
          createdCount: result.createdCount,
          updatedCount: result.updatedCount,
          error: null,
        },
      });
      lastPersistedProgress = result.processedCount;
      lastProgressAt = now;
    }
    await options.onProgress?.({ ...result });
  };
  const seenActorIds = new Set<string>();
  const seenActorRefs = new Set<string>();
  const reconcileBuilders = options.reconcileBuilders ?? completeCatalog;
  const builderConcurrency = Math.min(Math.max(options.builderConcurrency ?? 4, 1), 8);
  const builderBatchDelayMs = Math.min(Math.max(options.builderBatchDelayMs ?? 150, 0), 5_000);
  const maxBuilders = Math.max(options.maxBuilders ?? Number.POSITIVE_INFINITY, 0);

  const persistItems = async (pageItems: ApifyStoreSearchResult[]) => {
    const remaining = Number.isFinite(maxActors)
      ? Math.max(0, maxActors - result.processedCount)
      : pageItems.length;
    const items = pageItems
      .filter((actor) => {
        if (builderUsername && actor.username.toLocaleLowerCase() !== builderUsername) {
          return false;
        }
        const ref = actorRef(actor.username, actor.name);
        if (seenActorIds.has(actor.id) || seenActorRefs.has(ref)) return false;
        seenActorIds.add(actor.id);
        seenActorRefs.add(ref);
        return true;
      })
      .slice(0, remaining);
    if (items.length === 0) return 0;
    const counts = await persistSearchActorBatch(database, items, new Date());
    result.processedCount += items.length;
    result.createdCount += counts.createdCount;
    result.updatedCount += counts.updatedCount;
    await reportProgress();
    return items.length;
  };

  // The documented public Store API supports stable offsets up to its reported
  // total. One complete `includeUnrunnableActors=true` traversal is both more
  // current and dramatically less rate-limit-prone than combining overlapping
  // popularity/category/pricing searches.
  const partitions = [
    {
      sortBy: (completeCatalog ? "lastUpdate" : "popularity") as "lastUpdate" | "popularity",
    },
  ];

  try {
    partitionLoop: for (const partition of partitions) {
      let recommId: string | undefined;
      for (let offset = startOffset; offset < startOffset + maxActors; offset += pageSize) {
        const requestedLimit = Math.min(pageSize, startOffset + maxActors - offset);
        const page = await apify.searchStorePage({
          q: builderUsername,
          ...(recommId ? { recommId } : { offset }),
          limit: requestedLimit,
          ...partition,
          ...(completeCatalog
            ? { searchBackend: "public" as const, includeUnrunnableActors: true }
            : { searchIndex: "algolia" as const }),
        });
        if (!result.expectedCount || page.totalResults! > result.expectedCount) {
          result.expectedCount = page.totalResults;
        }
        if (page.items.length === 0) break;
        const persistedCount = await persistItems(page.items);
        if (persistedCount === 0) {
          if (page.totalResults !== null && offset + page.items.length >= page.totalResults) break;
          if (page.items.length < requestedLimit) break;
          continue;
        }

        if (result.processedCount >= maxActors) break partitionLoop;
        if (page.totalResults !== null && offset + page.items.length >= page.totalResults) break;
        if (page.items.length < requestedLimit) break;
        if (page.recommId) {
          if (page.recommId === recommId) break;
          recommId = page.recommId;
        }
      }
    }

    // The Store listing is the complete, daily source of truth. Sitemap
    // reconciliation is deliberately opt-in: fetching it during every daily
    // crawl adds thousands of unrelated requests and can turn a complete
    // persisted snapshot into a failed run when the sitemap is transiently
    // unavailable. A targeted builder refresh already has an authoritative
    // total from the public API and must never fan out into other builders.
    if (
      completeCatalog &&
      !builderUsername &&
      reconcileBuilders &&
      result.processedCount < maxActors
    ) {
      const sitemapActors = await discoverSitemapActors(options.fetchImpl ?? fetch);
      if (reconcileBuilders) {
        const usernames = [
          ...new Set([...sitemapActors.values()].map((actor) => actor.username)),
        ].slice(0, maxBuilders);
        for (
          let batchOffset = 0;
          batchOffset < usernames.length;
          batchOffset += builderConcurrency
        ) {
          const batch = usernames.slice(batchOffset, batchOffset + builderConcurrency);
          await Promise.all(
            batch.map(async (username) => {
              for (let offset = 0; result.processedCount < maxActors; offset += 1_000) {
                const page = await apify.searchStorePage({
                  q: username,
                  offset,
                  limit: 1_000,
                  sortBy: "lastUpdate",
                  searchBackend: "public",
                  includeUnrunnableActors: true,
                });
                const exactItems = page.items.filter(
                  (actor) => actor.username.toLocaleLowerCase() === username.toLocaleLowerCase(),
                );
                await persistItems(exactItems);
                if (page.items.length < 1_000) break;
                if (page.totalResults !== null && offset + page.items.length >= page.totalResults) {
                  break;
                }
              }
            }),
          );
          if (batchOffset + builderConcurrency < usernames.length && builderBatchDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, builderBatchDelayMs));
          }
        }
      }

      const existingActors = await database.storeActor.findMany({
        where: { isPublic: true },
        select: { username: true, actorName: true },
      });
      const existingRefs = new Set(
        existingActors.map((actor) => actorRef(actor.username, actor.actorName)),
      );
      const missingActors = [...sitemapActors.entries()]
        .filter(([, actor]) => !existingRefs.has(actorRef(actor.username, actor.actorName)))
        .map(([apifyActorId, actor]) => ({ apifyActorId, ...actor }));
      const now = new Date();
      for (let offset = 0; offset < missingActors.length; offset += 1_000) {
        const batch = missingActors.slice(offset, offset + 1_000);
        await database.storeActor.createMany({
          data: batch.map((actor) => ({
            ...actor,
            title: actor.actorName,
            isPublic: true,
            firstSeenAt: now,
            lastSeenAt: now,
          })),
          skipDuplicates: true,
        });
        result.processedCount += batch.length;
        result.createdCount += batch.length;
        await reportProgress();
        if (result.processedCount >= maxActors) break;
      }
      result.expectedCount = Math.max(result.expectedCount ?? 0, sitemapActors.size);
    }

    const capturedAt = startOfUtcDay(new Date());
    const observedStoreActorWhere: Prisma.StoreActorWhereInput = {
      isPublic: true,
      // Sitemap-only placeholders use owner/name as an ID and are not
      // returned by the Store API, so they cannot have a truthful metric
      // snapshot. Do not let them keep the daily catalog permanently partial.
      apifyActorId: { not: { contains: "/" } },
      lastSeenAt: { gte: capturedAt },
      ...(builderUsername ? { username: builderUsername } : {}),
    };
    const [observedActorCount, observedSnapshotCount] = completeCatalog
      ? await Promise.all([
          database.storeActor.count({ where: observedStoreActorWhere }),
          database.storeActorSnapshot.count({
            where: { capturedAt, storeActor: observedStoreActorWhere },
          }),
        ])
      : [0, 0];
    // Apify's public endpoint advertises the whole catalog but stops serving
    // rows beyond its offset ceiling. Completion is therefore defined by the
    // daily set that the authoritative Store endpoint actually returned and
    // that was persisted as a snapshot, not by an unreachable reported total.
    // Preserve the Store/sitemap expectation when no observed rows can be
    // counted. Replacing it with zero hides an incomplete crawl as 0/0 and
    // makes progress reporting misleading.
    if (completeCatalog && observedActorCount > 0) result.expectedCount = observedActorCount;
    const isComplete =
      !completeCatalog || (observedActorCount > 0 && observedSnapshotCount >= observedActorCount);
    await database.storeCatalogSync.update({
      where: { id: run.id },
      data: {
        status: isComplete ? "COMPLETED" : "PARTIAL",
        expectedCount: result.expectedCount,
        processedCount: result.processedCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        ...(isComplete
          ? {}
          : {
              error: `Persisted metrics for ${observedSnapshotCount.toLocaleString("en-IN")} of ${observedActorCount.toLocaleString("en-IN")} current Store Actors`,
            }),
        completedAt: new Date(),
      },
    });
    return result;
  } catch (error) {
    await failSyncRun(database, run.id, error, result);
    throw error;
  }
}

export async function syncStoreActorDetails(
  apify: ApifyClientWrapper,
  options: {
    /** Restrict detail enrichment to one public builder. */
    builderUsername?: string;
    /** Target a reviewed reconciliation without refreshing unrelated records. */
    actorIds?: string[];
    /** Rebuild current metrics from immutable-ID details after identity repair. */
    repairMetrics?: boolean;
    limit?: number;
    concurrency?: number;
    batchDelayMs?: number;
    database?: StoreCatalogDatabase;
    onProgress?: ProgressCallback;
  } = {},
): Promise<StoreCatalogSyncResult> {
  const database = options.database ?? db;
  const limit = Math.min(Math.max(options.limit ?? 5_000, 1), 5_000);
  const concurrency = Math.min(Math.max(options.concurrency ?? 4, 1), 8);
  const batchDelayMs = Math.min(Math.max(options.batchDelayMs ?? 350, 0), 5_000);
  const builderUsername = options.builderUsername?.trim().toLocaleLowerCase() ?? "";
  const publicActorWhere: Prisma.StoreActorWhereInput = {
    isPublic: true,
    // Sitemap-only placeholders use an owner/name sentinel as their ID. They
    // have no Store metrics and should never produce failing detail requests.
    apifyActorId: { not: { contains: "/" } },
    ...(builderUsername ? { username: builderUsername } : {}),
    ...(options.actorIds ? { id: { in: options.actorIds } } : {}),
  };
  const run = await createSyncRun(database, "DETAILS");
  const result: StoreCatalogSyncResult = {
    expectedCount: await database.storeActor.count({ where: publicActorWhere }),
    processedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    failedCount: 0,
  };

  try {
    const actorsNeedingLifecycle = await database.storeActor.findMany({
      where: {
        ...publicActorWhere,
        OR: [{ detailsSyncedAt: null }, { firstPublishedAt: null, apifyCreatedAt: null }],
      },
      // New Store discoveries need createdAt/firstPublishedAt first so the
      // new-Actor leaderboard and daily publishing chart do not wait behind
      // tens of thousands of older catalog records.
      orderBy: [
        { users30Days: "desc" },
        { totalUsers: "desc" },
        { firstSeenAt: "desc" },
        { id: "asc" },
      ],
      take: limit,
      select: {
        id: true,
        apifyActorId: true,
        totalRuns: true,
        totalUsers: true,
        users7Days: true,
        users30Days: true,
        users90Days: true,
        runs30Days: true,
        reviewCount: true,
        reviewRating: true,
        bookmarkCount: true,
      },
    });
    const remaining = limit - actorsNeedingLifecycle.length;
    const staleActors = remaining
      ? await database.storeActor.findMany({
          where: {
            ...publicActorWhere,
            id: { ...(options.actorIds ? { in: options.actorIds } : {}), notIn: actorsNeedingLifecycle.map((actor) => actor.id) },
          },
          orderBy: [{ detailsSyncedAt: "asc" }, { totalUsers: "desc" }, { id: "asc" }],
          take: remaining,
          select: {
            id: true,
            apifyActorId: true,
            totalRuns: true,
            totalUsers: true,
            users7Days: true,
            users30Days: true,
            users90Days: true,
            runs30Days: true,
            reviewCount: true,
            reviewRating: true,
            bookmarkCount: true,
          },
        })
      : [];
    const actors = [...actorsNeedingLifecycle, ...staleActors];
    const capturedAt = new Date();
    capturedAt.setUTCHours(0, 0, 0, 0);

    for (let offset = 0; offset < actors.length; offset += concurrency) {
      const batch = actors.slice(offset, offset + concurrency);
      await Promise.all(
        batch.map(async (actor) => {
          try {
            const detail = await apify.getActor(actor.apifyActorId);
            if (!detail) {
              throw new ApifyClientError("not_found", "Actor is no longer available in Store", {
                status: 404,
              });
            }
            const now = new Date();
            const data = detailActorData(detail, now);
            await reconcileStoreActorIdentity(apify, actor.id, detail, database);
            // Store search is the canonical, same-pass leaderboard metric
            // source. Detail reads are for lifecycle fields, Store metadata,
            // pricing and reviews; their rolling counters can lag the search
            // index, so never let them overwrite a fresh daily snapshot.
            const metrics = options.repairMetrics ? {
              totalRuns: data.totalRuns,
              totalUsers: data.totalUsers,
              users7Days: data.users7Days,
              users30Days: data.users30Days,
              users90Days: data.users90Days,
              runs30Days: data.runs30Days,
              reviewCount: data.reviewCount,
              reviewRating: data.reviewRating,
              bookmarkCount: data.bookmarkCount,
            } : {
              totalRuns: actor.totalRuns ?? data.totalRuns,
              totalUsers: actor.totalUsers ?? data.totalUsers,
              users7Days: actor.users7Days ?? data.users7Days,
              users30Days: actor.users30Days ?? data.users30Days,
              users90Days: actor.users90Days ?? data.users90Days,
              runs30Days: actor.runs30Days ?? data.runs30Days,
              reviewCount: actor.reviewCount ?? data.reviewCount,
              reviewRating: actor.reviewRating ?? data.reviewRating,
              bookmarkCount: actor.bookmarkCount ?? data.bookmarkCount,
            };
            await database.$transaction([
              database.storeActor.update({
                where: { id: actor.id },
                data: { ...data, ...metrics, ...(detail.id ? { apifyActorId: detail.id } : {}) },
              }),
              database.storeActorSnapshot.upsert({
                where: {
                  storeActorId_capturedAt: { storeActorId: actor.id, capturedAt },
                },
                create: {
                  storeActorId: actor.id,
                  capturedAt,
                  totalRuns: metrics.totalRuns,
                  totalUsers: metrics.totalUsers,
                  users30Days: metrics.users30Days,
                  runs30Days: metrics.runs30Days,
                  reviewCount: metrics.reviewCount,
                  reviewRating: metrics.reviewRating,
                },
                update: {
                  totalRuns: metrics.totalRuns,
                  totalUsers: metrics.totalUsers,
                  users30Days: metrics.users30Days,
                  runs30Days: metrics.runs30Days,
                  reviewCount: metrics.reviewCount,
                  reviewRating: metrics.reviewRating,
                },
              }),
            ]);
            result.updatedCount += 1;
          } catch (error) {
            result.failedCount += 1;
            await database.storeActor.update({
              where: { id: actor.id },
              data: {
                detailsSyncedAt:
                  error instanceof ApifyClientError && error.code === "rate_limited"
                    ? null
                    : new Date(),
                detailsSyncError:
                  error instanceof Error ? error.message : "Actor details could not be loaded",
              },
            });
          } finally {
            result.processedCount += 1;
          }
        }),
      );
      await options.onProgress?.({ ...result });
      if (offset + concurrency < actors.length && batchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
      }
    }

    await database.storeCatalogSync.update({
      where: { id: run.id },
      data: {
        status: result.failedCount > 0 ? "PARTIAL" : "COMPLETED",
        expectedCount: result.expectedCount,
        processedCount: result.processedCount,
        updatedCount: result.updatedCount,
        error: result.failedCount > 0 ? `${result.failedCount} Actor detail requests failed` : null,
        completedAt: new Date(),
      },
    });
    return result;
  } catch (error) {
    await failSyncRun(database, run.id, error, result);
    throw error;
  }
}
