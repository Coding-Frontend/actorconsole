import { db } from "@actorconsole/db";
import { publicCache } from "./public-cache.js";
import { PUBLIC_CATALOG_ACTOR_WHERE } from "./public-catalog-filter.js";

const PAGE_SIZE = 5_000;
const SITE_ORIGIN = new URL(process.env.WEB_BASE_URL || "https://actorconsole.com").origin;
const cacheOptions = { revalidate: 300, staleWhileRevalidate: 300 };

const actorsWhere = { ...PUBLIC_CATALOG_ACTOR_WHERE, username: { not: "compare" } };
// "compare" is a route segment. The Store owner "apify" has Actor pages
// but does not have a public builder profile.
const buildersWhere = { ...actorsWhere, username: { notIn: ["apify", "compare"] } };

export type CatalogSitemapKind = "builders" | "actors";

export const getCatalogSitemapPages = publicCache(
  async () => {
    const [builders, actors] = await Promise.all([
      db.storeActor.groupBy({ by: ["username"], where: buildersWhere }),
      db.storeActor.count({ where: actorsWhere }),
    ]);
    return {
      builders: Math.ceil(builders.length / PAGE_SIZE),
      actors: Math.ceil(actors / PAGE_SIZE),
    };
  },
  ["catalog-sitemap-pages"],
  cacheOptions,
);

function isIdentifier(value: string) {
  return /^[a-zA-Z0-9_.-]{1,100}$/.test(value) && value !== "." && value !== "..";
}

export const getCatalogSitemapXml = publicCache(
  async (kind: CatalogSitemapKind, page: number) => {
    const skip = (page - 1) * PAGE_SIZE;
    const paths =
      kind === "builders"
        ? (
            await db.storeActor.groupBy({
              by: ["username"],
              where: buildersWhere,
              orderBy: { username: "asc" },
              skip,
              take: PAGE_SIZE,
            })
          )
            .filter(({ username }) => isIdentifier(username))
            .map(({ username }) => `/builders/${username}`)
        : (
            await db.storeActor.findMany({
              where: actorsWhere,
              orderBy: { id: "asc" },
              skip,
              take: PAGE_SIZE,
              select: { username: true, actorName: true },
            })
          )
            .filter(({ username, actorName }) => isIdentifier(username) && isIdentifier(actorName))
            .map(({ username, actorName }) => `/builders/${username}/actors/${actorName}`);
    if (!paths.length) return null;
    const urls = paths.map((path) => `<url><loc>${SITE_ORIGIN}${path}</loc></url>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  },
  ["catalog-sitemap-xml"],
  cacheOptions,
);
