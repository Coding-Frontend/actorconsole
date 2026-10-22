// These routes return the same public data for every caller. Never extend this
// to /account, /auth, workspace Actor APIs, billing, or administrative reads.
export const PUBLIC_CATALOG_TAG = "actorconsole-public-catalog";
export const PUBLIC_CACHE_SECONDS = 60;
export const PUBLIC_CATALOG_OPERATIONS = new Set([
  "summary", "comparison-builders", "comparison-history", "search-builders",
  "search-actors", "leaderboard", "profile", "actor", "research-categories",
  "research", "plan-features",
]);

export function isPublicCachePath(path: string[]) {
  if (path.length === 3 && path[0] === "public" && path[1] === "catalog") {
    return PUBLIC_CATALOG_OPERATIONS.has(path[2]);
  }
  return (path.length === 2 && path[0] === "public" && path[1] === "seo") ||
    (path.length === 6 && path[0] === "public" && path[1] === "builders" &&
      path[3] === "actors" && ["documentation", "reviews"].includes(path[5]));
}
