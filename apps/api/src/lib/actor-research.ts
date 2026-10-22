import { estimateActorEarnings, type ActorEarnings } from "@actorconsole/shared/actor-earnings";
import { db, Prisma } from "@actorconsole/db";
import { publicCache } from "./public-cache.js";

export const researchSorts = {
  users: "Active users",
  trending: "New total users",
  runs: "Runs / 30 days",
  newest: "Recently published",
  rating: "Rating",
} as const;
export type ResearchSort = keyof typeof researchSorts;
export interface ResearchActor {
  earnings?: ActorEarnings;
  id: string;
  username: string;
  actorName: string;
  title: string | null;
  description: string | null;
  pictureUrl: string | null;
  users7Days: number | null;
  users30Days: number | null;
  users90Days: number | null;
  totalUsers: number | null;
  totalRuns: number | null;
  runs30Days: number | null;
  reviewRating: number | null;
  reviewCount: number | null;
  firstPublishedAt: Date | null;
  lastSeenAt: Date;
  categories: unknown;
  pricingInfos: unknown;
  baselineUsers: number | null;
  baselineAt: Date | null;
  newUsers: number | null;
}
export function researchFilters(input: Record<string, string | string[] | undefined>) {
  const text = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
  const parsed = Number(text("page"));
  return {
    query: text("q").trim().slice(0, 100),
    category: text("category").trim().slice(0, 80),
    sort: Object.hasOwn(researchSorts, text("sort"))
      ? (text("sort") as ResearchSort)
      : ("users" as ResearchSort),
    window: [7, 30, 90].includes(Number(text("window"))) ? Number(text("window")) : 30,
    page: Math.max(1, Math.min(10000, Math.floor(parsed) || 1)),
  };
}
export type ResearchFilters = ReturnType<typeof researchFilters>;

export const getResearchCategories = publicCache(
  async () => {
    const rows = await db.$queryRaw<{ categories: unknown }[]>(Prisma.sql`
      SELECT DISTINCT categories FROM StoreActor
      WHERE isPublic = true AND isDeprecated = false AND apifyActorId NOT LIKE '%/%'`);
    return [...new Set(rows.flatMap((row) => categoryNames(row.categories)))]
      .filter((category) => category.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
  },
  ["actor-research-categories-v1"],
  { revalidate: 300 },
);

export async function getActorResearch(filters: ResearchFilters) {
  const cutoff = new Date(Date.now() - filters.window * 86400000);
  const earliest = new Date(cutoff.getTime() - 3 * 86400000);
  const query = `%${filters.query.replace(/[\\%_]/g, "\\$&")}%`;
  const search = filters.query
    ? Prisma.sql`AND (a.title LIKE ${query} OR a.description LIKE ${query} OR a.username LIKE ${query} OR a.actorName LIKE ${query})`
    : Prisma.empty;
  const category = filters.category
    ? Prisma.sql`AND JSON_CONTAINS(a.categories, ${JSON.stringify(filters.category)})`
    : Prisma.empty;
  const active =
    filters.window === 7
      ? Prisma.sql`a.users7Days`
      : filters.window === 90
        ? Prisma.sql`a.users90Days`
        : Prisma.sql`a.users30Days`;
  const order =
    filters.sort === "trending"
      ? Prisma.sql`newUsers DESC`
      : filters.sort === "runs"
        ? Prisma.sql`a.runs30Days DESC`
        : filters.sort === "rating"
          ? Prisma.sql`a.reviewRating DESC, a.reviewCount DESC`
          : filters.sort === "newest"
            ? Prisma.sql`a.firstPublishedAt DESC`
            : Prisma.sql`${active} DESC`;
  const eligible = Prisma.sql`a.isPublic = true AND a.isDeprecated = false AND a.apifyActorId NOT LIKE '%/%' ${search} ${category}`;
  const [actors, count] = await Promise.all([
    db.$queryRaw<Array<Omit<ResearchActor, "newUsers"> & { newUsers: number | bigint | null }>>(Prisma.sql`
      SELECT a.id, a.username, a.actorName, a.title, a.description, a.pictureUrl,
        a.users7Days, a.users30Days, a.users90Days, a.totalUsers, a.totalRuns, a.runs30Days,
        a.reviewRating, a.reviewCount, a.firstPublishedAt, a.lastSeenAt, a.categories, a.pricingInfos,
        s.totalUsers AS baselineUsers, s.capturedAt AS baselineAt,
        CASE WHEN s.totalUsers IS NOT NULL AND a.totalUsers >= s.totalUsers THEN a.totalUsers - s.totalUsers ELSE NULL END AS newUsers
      FROM StoreActor a LEFT JOIN StoreActorSnapshot s ON s.id = (
        SELECT baseline.id FROM StoreActorSnapshot baseline WHERE baseline.storeActorId = a.id
          AND baseline.capturedAt <= ${cutoff} AND baseline.capturedAt >= ${earliest}
        ORDER BY baseline.capturedAt DESC LIMIT 1)
      WHERE ${eligible} ORDER BY ${order}, a.id ASC LIMIT 24 OFFSET ${(filters.page - 1) * 24}`),
    db.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM StoreActor a WHERE ${eligible}`,
    ),
  ]);
  return {
    actors: actors.map((actor) => ({
      ...actor,
      // MariaDB returns the computed integer difference as BIGINT, even though
      // both source columns are Int. Keep the public metric numeric for JSON
      // transport and client-side comparisons.
      newUsers: actor.newUsers == null ? null : Number(actor.newUsers),
      pricingInfos: parseCatalogJson(actor.pricingInfos),
      earnings: estimateActorEarnings(actor),
    })),
    total: Number(count[0]?.total ?? 0),
    page: filters.page,
    pageSize: 24,
  };
}

function parseCatalogJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function categoryNames(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return categoryNames(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
