import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { ApifyStoreSearchResult } from "@actorconsole/apify";
import { db, Prisma } from "@actorconsole/db";
import { AppError } from "../middleware/error.js";
import { recordUserAudit } from "../lib/user-audit.js";
import { assertPlanFeature } from "../lib/plan-access.js";
import type { AppEnv } from "../app.js";
import { businessProfileScope } from "../lib/business-profile.js";

const keywordQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const watchKeywordSchema = z.object({ keyword: z.string().trim().min(1).max(120) });

const PUBLIC_STORE_ACTOR_WHERE = {
  isPublic: true,
  isDeprecated: false,
  // Sitemap-only placeholders use owner/name as an ID and have no Store
  // metrics. Keep them out of keyword results.
  apifyActorId: { not: { contains: "/" } },
} satisfies Prisma.StoreActorWhereInput;

const storeActorSearchSelect = {
  apifyActorId: true,
  username: true,
  actorName: true,
  title: true,
  description: true,
  pictureUrl: true,
  ownerName: true,
  ownerPictureUrl: true,
  apifyCreatedAt: true,
  firstPublishedAt: true,
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
  lastSeenAt: true,
} satisfies Prisma.StoreActorSelect;

type StoreActorSearchRow = Prisma.StoreActorGetPayload<{
  select: typeof storeActorSearchSelect;
}>;

const MAX_SEARCH_CANDIDATES = 500;

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function searchTerms(keyword: string): string[] {
  const normalized = normalizeKeyword(keyword);
  const tokens = [...new Set(normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean))];
  return (tokens.length ? tokens : [normalized]).slice(0, 8);
}

function stringArrayFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const label = item as { name?: unknown; _id?: unknown };
      return typeof label.name === "string"
        ? label.name
        : typeof label._id === "string"
          ? label._id
          : "";
    })
    .filter(Boolean);
}

function pricingInfosFromJson(value: unknown): ApifyStoreSearchResult["pricingInfos"] {
  return Array.isArray(value) ? (value as ApifyStoreSearchResult["pricingInfos"]) : undefined;
}

function toPersistedStoreResult(row: StoreActorSearchRow): ApifyStoreSearchResult {
  return {
    id: row.apifyActorId,
    username: row.username,
    name: row.actorName,
    title: row.title,
    description: row.description,
    pictureUrl: row.pictureUrl,
    totalUsers: row.totalUsers ?? undefined,
    totalRuns: row.totalRuns ?? undefined,
    stats: {
      totalRuns: row.totalRuns ?? undefined,
      totalUsers: row.totalUsers ?? undefined,
      monthlyUsers: row.users30Days ?? undefined,
      totalUsers7Days: row.users7Days ?? undefined,
      totalUsers30Days: row.users30Days ?? undefined,
      totalUsers90Days: row.users90Days ?? undefined,
      actorReviewCount: row.reviewCount ?? undefined,
      actorReviewRating: row.reviewRating ?? undefined,
      rating: row.reviewRating ?? undefined,
      bookmarkCount: row.bookmarkCount ?? undefined,
      publicActorRunStats30Days:
        row.runs30Days === null ? undefined : { TOTAL: row.runs30Days ?? undefined },
    },
    categories: stringArrayFromJson(row.categories),
    pricingInfos: pricingInfosFromJson(row.pricingInfos),
    userFullName: row.ownerName,
    userPictureUrl: row.ownerPictureUrl,
    reviewCount: row.reviewCount ?? undefined,
    reviewRating: row.reviewRating ?? undefined,
    metaLabels: stringArrayFromJson(row.metaLabels),
    createdAt: row.apifyCreatedAt?.toISOString(),
    modifiedAt: row.apifyModifiedAt?.toISOString(),
    firstPublishedAt: row.firstPublishedAt?.toISOString(),
    url: `https://apify.com/${row.username}/${row.actorName}`,
  };
}

function localRelevanceScore(
  item: ApifyStoreSearchResult,
  terms: string[],
  wholeQuery: string,
): number {
  const fields = [
    { value: item.name, weight: 10 },
    { value: item.title ?? "", weight: 9 },
    { value: item.username, weight: 7 },
    { value: item.userFullName ?? "", weight: 3 },
    { value: item.description ?? "", weight: 2 },
  ].map((field) => ({ ...field, value: field.value.toLocaleLowerCase() }));
  let score = 0;
  let matchedTerms = 0;
  for (const term of terms) {
    let bestMatch = 0;
    for (const field of fields) {
      if (field.value === term) bestMatch = Math.max(bestMatch, field.weight * 4);
      else if (field.value.startsWith(term)) bestMatch = Math.max(bestMatch, field.weight * 2);
      else if (field.value.includes(term)) bestMatch = Math.max(bestMatch, field.weight);
    }
    if (bestMatch > 0) matchedTerms += 1;
    score += bestMatch;
  }
  if (matchedTerms === terms.length) score += 25;
  if (fields.some((field) => field.value.includes(wholeQuery) && wholeQuery.length > 1)) {
    score += 20;
  }
  return score;
}

async function searchPersistedStore(keyword: string, limit: number) {
  const normalized = normalizeKeyword(keyword);
  const terms = searchTerms(keyword);
  const candidates = await db.storeActor.findMany({
    where: {
      ...PUBLIC_STORE_ACTOR_WHERE,
      OR: terms.flatMap((term) => [
        { username: { contains: term } },
        { actorName: { contains: term } },
        { title: { contains: term } },
        { description: { contains: term } },
        { ownerName: { contains: term } },
      ]),
    },
    // Keep the local query bounded. Demand ordering gives the in-memory
    // relevance pass a useful fallback when a broad term matches many rows.
    orderBy: [{ users30Days: "desc" }, { totalUsers: "desc" }, { id: "asc" }],
    take: Math.min(MAX_SEARCH_CANDIDATES, Math.max(100, limit * 12)),
    select: storeActorSearchSelect,
  });
  const ranked = candidates
    .map((row) => ({
      item: toPersistedStoreResult(row),
      row,
    }))
    .sort((left, right) => {
      const scoreDifference =
        localRelevanceScore(right.item, terms, normalized) -
        localRelevanceScore(left.item, terms, normalized);
      if (scoreDifference !== 0) return scoreDifference;
      return (
        (right.row.users30Days ?? right.row.totalUsers ?? 0) -
          (left.row.users30Days ?? left.row.totalUsers ?? 0) ||
        left.row.apifyActorId.localeCompare(right.row.apifyActorId)
      );
    })
    .slice(0, limit);
  return {
    items: ranked.map(({ item }) => item),
    catalogAsOf: ranked.reduce<Date | null>(
      (latest, entry) => (!latest || entry.row.lastSeenAt > latest ? entry.row.lastSeenAt : latest),
      null,
    ),
  };
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

type PublicActorHistory = {
  historyPoints: number;
  demandTrendPercent: number | null;
  latestMonthlyUsers: number | null;
  latestTotalUsers: number | null;
};

function publicHistorySignals(
  snapshots: Array<{
    monthlyUsers: number | null;
    usersTotal: number | null;
  }>,
): PublicActorHistory {
  const [latest, previous] = snapshots;
  const latestValue = latest?.monthlyUsers ?? latest?.usersTotal ?? null;
  const previousValue = previous?.monthlyUsers ?? previous?.usersTotal ?? null;
  const demandTrendPercent =
    latestValue !== null && previousValue !== null && previousValue > 0
      ? Number((((latestValue - previousValue) / previousValue) * 100).toFixed(1))
      : null;
  return {
    historyPoints: snapshots.length,
    demandTrendPercent,
    latestMonthlyUsers: latest?.monthlyUsers ?? null,
    latestTotalUsers: latest?.usersTotal ?? null,
  };
}

function calculateMetrics(items: ApifyStoreSearchResult[]) {
  const resultCount = items.length;
  const totalRuns = items.reduce((sum, item) => sum + (item.stats?.totalRuns ?? 0), 0);
  const ratings = items
    .map((item) => item.stats?.actorReviewRating ?? item.reviewRating ?? item.stats?.rating)
    .filter((rating): rating is number => typeof rating === "number");
  const averageRating = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : 0;
  const repeatRates = items
    .map((item) => {
      const monthlyUsers = item.stats?.totalUsers30Days ?? item.stats?.monthlyUsers;
      const usersTotal = item.totalUsers ?? item.stats?.totalUsers;
      if (!monthlyUsers || !usersTotal) return null;
      return clamp((monthlyUsers / usersTotal) * 100);
    })
    .filter((rate): rate is number => rate !== null);
  const repeatUseRate = repeatRates.length
    ? Number((repeatRates.reduce((sum, rate) => sum + rate, 0) / repeatRates.length).toFixed(1))
    : null;

  // This is a transparent, first-party difficulty score based on the actual
  // Store response: number of competing listings, observed run volume, and
  // average rating. It is not presented as a paid SEO provider's estimate.
  const difficultyScore = Math.round(
    clamp(resultCount * 1.5 + Math.log10(totalRuns + 1) * 12 + (averageRating / 5) * 20),
  );
  const demandScore = Math.round(
    clamp(
      Math.log10(
        1 +
          items.reduce(
            (sum, item) =>
              sum +
              (item.stats?.totalUsers30Days ??
                item.stats?.monthlyUsers ??
                item.totalUsers ??
                item.stats?.totalRuns ??
                0),
            0,
          ),
      ) * 18,
    ),
  );

  return {
    resultCount,
    difficultyScore,
    repeatUseRate,
    demandScore,
  };
}

function mapResult(
  item: ApifyStoreSearchResult,
  metrics: ReturnType<typeof calculateMetrics>,
  index: number,
  history?: PublicActorHistory,
) {
  const monthlyUsers = item.stats?.totalUsers30Days ?? item.stats?.monthlyUsers ?? null;
  const totalRuns = item.stats?.totalRuns ?? null;
  const usersTotal = item.totalUsers ?? item.stats?.totalUsers ?? null;
  const demand = monthlyUsers ?? usersTotal ?? totalRuns ?? 0;
  const resultDifficulty = Math.round(
    clamp(metrics.difficultyScore * 0.7 + Math.min(100, index * 3) * 0.3),
  );
  const opportunityScore = Math.round(
    clamp(metrics.demandScore * 0.6 + (100 - resultDifficulty) * 0.4),
  );
  return {
    id: item.id,
    username: item.username,
    name: item.name,
    title: item.title,
    description: item.description,
    pictureUrl: item.pictureUrl,
    totalRuns,
    usersTotal,
    monthlyUsers,
    rating: item.stats?.actorReviewRating ?? item.reviewRating ?? item.stats?.rating ?? null,
    reviewCount: item.stats?.actorReviewCount ?? item.reviewCount ?? null,
    users7Days: item.stats?.totalUsers7Days ?? null,
    users30Days: item.stats?.totalUsers30Days ?? item.stats?.monthlyUsers ?? null,
    users90Days: item.stats?.totalUsers90Days ?? null,
    bookmarkCount: item.stats?.bookmarkCount ?? null,
    metaLabels: item.metaLabels ?? [],
    difficultyScore: resultDifficulty,
    opportunityScore,
    demandSignal: demand,
    historyPoints: history?.historyPoints ?? 0,
    demandTrendPercent: history?.demandTrendPercent ?? null,
    historicalMonthlyUsers: history?.latestMonthlyUsers ?? null,
    historicalTotalUsers: history?.latestTotalUsers ?? null,
    url: item.url,
  };
}

async function loadKeywordCatalog(q: string, limit: number) {
  const { items, catalogAsOf } = await searchPersistedStore(q, limit);
  const metrics = calculateMetrics(items);
  const trackedActors = items.length
    ? await db.storeActor.findMany({
        where: {
          ...PUBLIC_STORE_ACTOR_WHERE,
          apifyActorId: { in: items.map((item) => item.id) },
        },
        select: {
          apifyActorId: true,
          username: true,
          actorName: true,
          snapshots: {
            orderBy: { capturedAt: "desc" },
            take: 2,
            select: { users30Days: true, totalUsers: true },
          },
        },
      })
    : [];
  const historyByActor = new Map<string, PublicActorHistory>();
  for (const actor of trackedActors) {
    const history = publicHistorySignals(
      actor.snapshots.map((snapshot) => ({
        monthlyUsers: snapshot.users30Days,
        usersTotal: snapshot.totalUsers,
      })),
    );
    historyByActor.set(actor.apifyActorId, history);
    historyByActor.set(`${actor.username}/${actor.actorName}`, history);
  }
  const mappedItems = items.map((item, index) =>
    mapResult(
      item,
      metrics,
      index,
      historyByActor.get(item.id) ?? historyByActor.get(`${item.username}/${item.name}`),
    ),
  );
  return { mappedItems, metrics, catalogAsOf };
}

export const keywordRoutes = new Hono<AppEnv>()
  .get("/compare", zValidator("query", keywordQuerySchema), async (c) => {
    await assertPlanFeature(c.get("session"), "keyword_research");
    const { q, limit } = c.req.valid("query");
    const { mappedItems } = await loadKeywordCatalog(q, limit);
    return c.json({ ok: true, data: mappedItems });
  })
  .get("/search", zValidator("query", keywordQuerySchema), async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "keyword_research");
    const { q, limit } = c.req.valid("query");
    const normalizedKeyword = normalizeKeyword(q);
    const { mappedItems, metrics, catalogAsOf } = await loadKeywordCatalog(q, limit);
    await db.keywordSearch.create({
      data: {
        userId: session.userId,
        ...(session.businessProfileId ? { businessProfileId: session.businessProfileId } : {}),
        keyword: q,
        normalizedKeyword,
        resultCount: metrics.resultCount,
        difficultyScore: metrics.difficultyScore,
        repeatUseRate: metrics.repeatUseRate,
      } as any,
    });
    const [workspaceSearchVolume, userSearchVolume, watch] = await Promise.all([
      db.keywordSearch.count({ where: { normalizedKeyword, ...businessProfileScope(session) } }),
      db.keywordSearch.count({
        where: { normalizedKeyword, userId: session.userId, ...businessProfileScope(session) },
      }),
      db.keywordWatch.findUnique({
        where: session.businessProfileId
          ? {
              businessProfileId_normalizedKeyword: {
                businessProfileId: session.businessProfileId,
                normalizedKeyword,
              },
            }
          : ({ userId_normalizedKeyword: { userId: session.userId, normalizedKeyword } } as never),
      }),
    ]);
    if (watch) {
      await db.keywordWatch.update({
        where: { id: watch.id },
        data: {
          keyword: q,
          searchCount: userSearchVolume,
          latestResultCount: metrics.resultCount,
          difficultyScore: metrics.difficultyScore,
          repeatUseRate: metrics.repeatUseRate,
          lastSearchedAt: new Date(),
        },
      });
    }
    await recordUserAudit(c, session, "keyword.search", `keyword:${normalizedKeyword}`, {
      resultCount: metrics.resultCount,
      difficultyScore: metrics.difficultyScore,
    });

    const historicalTrends = mappedItems
      .map((item) => item.demandTrendPercent)
      .filter((value): value is number => value !== null);

    return c.json({
      ok: true,
      data: mappedItems,
      meta: {
        keyword: q,
        searchVolume: workspaceSearchVolume,
        personalSearchVolume: userSearchVolume,
        resultCount: metrics.resultCount,
        difficultyScore: metrics.difficultyScore,
        repeatUseRate: metrics.repeatUseRate,
        historicalCoverage: historicalTrends.length,
        averageDemandTrendPercent: historicalTrends.length
          ? Number(
              (
                historicalTrends.reduce((sum, value) => sum + value, 0) / historicalTrends.length
              ).toFixed(1),
            )
          : null,
        watchlisted: Boolean(watch),
        methodology: `Demand combines the persisted Apify Store catalog, 7/30/90-day users when available, public runs, reviews, and catalog snapshots${catalogAsOf ? ` (last synced ${catalogAsOf.toISOString()})` : ""}. Difficulty uses competing listings, runs, and review ratings; repeat use uses 30-day users divided by total users.`,
      },
    });
  })

  .get("/watchlist", async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "keyword_watchlist");
    const watchlist = await db.keywordWatch.findMany({
      where: { userId: session.userId, ...businessProfileScope(session) },
      orderBy: { updatedAt: "desc" },
    });
    return c.json({ ok: true, data: watchlist });
  })

  .post("/watchlist", zValidator("json", watchKeywordSchema), async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "keyword_watchlist");
    const { keyword } = c.req.valid("json");
    const normalizedKeyword = normalizeKeyword(keyword);
    const existing = await db.keywordWatch.findUnique({
      where: session.businessProfileId
        ? {
            businessProfileId_normalizedKeyword: {
              businessProfileId: session.businessProfileId,
              normalizedKeyword,
            },
          }
        : ({ userId_normalizedKeyword: { userId: session.userId, normalizedKeyword } } as never),
    });
    const watch = existing
      ? await db.keywordWatch.update({
          where: { id: existing.id },
          data: { keyword },
        })
      : await db.keywordWatch.create({
          data: {
            userId: session.userId,
            ...(session.businessProfileId ? { businessProfileId: session.businessProfileId } : {}),
            keyword,
            normalizedKeyword,
          } as any,
        });
    await recordUserAudit(c, session, "keyword.watch.created", `keyword:${normalizedKeyword}`, {
      watchId: watch.id,
    });
    return c.json({ ok: true, data: watch }, existing ? 200 : 201);
  })

  .delete("/watchlist/:id", async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "keyword_watchlist");
    const id = c.req.param("id");
    const result = await db.keywordWatch.deleteMany({
      where: { id, userId: session.userId, ...businessProfileScope(session) },
    });
    if (result.count === 0) throw new AppError("not_found", "Keyword watch not found", 404);
    await recordUserAudit(c, session, "keyword.watch.deleted", `watch:${id}`);
    return c.json({ ok: true, data: { id } });
  });

export { calculateMetrics, normalizeKeyword, publicHistorySignals };
