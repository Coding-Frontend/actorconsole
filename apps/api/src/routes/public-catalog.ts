import { Hono } from "hono";
import { z } from "zod";
import * as builders from "../lib/builders.js";
import { getActorResearch, getResearchCategories } from "../lib/actor-research.js";
import { getPlanMarketingFeatures } from "../lib/plan-marketing-features.js";
import { encodeApiData } from "@actorconsole/shared/api-data";
import { GET as documentation } from "./web-auth/documentation.js";
import { GET as reviews } from "./web-auth/reviews.js";
import { GET as seo } from "./web-auth/seo.js";
import { GET as actor } from "./web-auth/public-actor.js";

const identifier = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/);
const window = z.union([z.literal(7), z.literal(30), z.literal(90)]);
const query = z.string().max(100);
const page = z.number().int().min(1).max(10_000);
const size = z.number().int().min(1).max(100);
const usernames = z.array(identifier).max(8);
const profileOptions = z.object({
  window: window.optional(), actorPage: page.optional(), actorPageSize: size.optional(),
  actorQuery: query.optional(), actorCategory: z.string().max(80).optional(),
  actorSort: z.enum(["active-users", "runs-30d", "total-users", "total-runs", "rating", "newest", "name"]).optional(),
});
function operation<T>(schema: z.ZodType<T>, load: (args: T) => Promise<unknown>) {
  return async (input: unknown) => {
    const result = schema.safeParse(input);
    if (!result.success) return null;
    return { data: encodeApiData(await load(result.data)) };
  };
}
// Only these validated public read operations may execute; callers cannot dispatch SQL or arbitrary methods.
const operations: Record<string, (input: unknown) => Promise<{ data: unknown } | null>> = {
  summary: operation(z.tuple([]), () => builders.getBuilderCatalogSummary()),
  "comparison-builders": operation(z.tuple([usernames, window, z.number().int().min(1).max(8)]),
    ([names, days, limit]) => builders.getBuildersForComparison(names, days, limit)),
  "comparison-history": operation(z.tuple([usernames, window]), ([names, days]) => builders.getBuilderComparisonHistory(names, days)),
  "search-builders": operation(z.tuple([query, window]), ([text, days]) => builders.searchBuildersForComparison(text, days)),
  "search-actors": operation(z.tuple([query, window]), ([text, days]) => builders.searchActorsForComparison(text, days)),
  leaderboard: operation(z.tuple([z.object({
    metric: z.enum(["new-actors", "actors", "monthly-users", "total-users", "monthly-runs", "total-runs", "estimated-revenue"]),
    direction: z.enum(["asc", "desc"]).optional(), window: window.optional(), query: query.optional(),
    page: page.optional(), pageSize: size.optional(),
  })]), ([options]) => builders.getBuilderLeaderboard(options)),
  profile: operation(z.tuple([identifier, profileOptions]), ([name, options]) => builders.getBuilderProfile(name, options)),
  actor: operation(z.tuple([identifier, identifier, window]), ([name, actorName, days]) => builders.getBuilderActorDetail(name, actorName, days)),
  "research-categories": operation(z.tuple([]), () => getResearchCategories()),
  research: operation(z.tuple([z.object({
    query, category: z.string().max(80), sort: z.enum(["users", "trending", "runs", "newest", "rating"]), window, page,
  })]), ([filters]) => getActorResearch(filters)),
  "plan-features": operation(z.tuple([]), () => getPlanMarketingFeatures()),
};
export const publicCatalogRoutes = new Hono()
  .get("/public/catalog/:operation", async (c) => {
    const name = c.req.param("operation");
    if (!Object.hasOwn(operations, name)) return c.json({ ok: false, error: "Unknown catalog operation" }, 404);
    const raw = c.req.query("args") ?? "[]";
    if (raw.length > 8192) return c.json({ ok: false, error: "Invalid arguments" }, 400);
    let args: unknown;
    try { args = JSON.parse(raw); } catch { return c.json({ ok: false, error: "Invalid arguments" }, 400); }
    const result = await operations[name](args);
    if (!result) return c.json({ ok: false, error: "Invalid arguments" }, 400);
    return c.json({ ok: true, ...result }, 200, { "cache-control": "public, max-age=60, stale-while-revalidate=300" });
  })
  .get("/public/builders/:username/actors/:actorName/documentation", (c) =>
    documentation(c.req.raw, { params: Promise.resolve({ username: c.req.param("username"), actorName: c.req.param("actorName") }) }))
  .get("/public/builders/:username/actors/:actorName/reviews", (c) =>
    reviews(c.req.raw, { params: Promise.resolve({ username: c.req.param("username"), actorName: c.req.param("actorName") }) }))
  .get("/public/seo", (c) => seo(c.req.raw))
  .get("/actors/public/:username/:actorName", (c) =>
    actor(c.req.raw, { params: Promise.resolve({ username: c.req.param("username"), actorName: c.req.param("actorName") }) }));
