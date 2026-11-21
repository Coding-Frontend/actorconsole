import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  blog: vi.fn(),
  changelog: vi.fn(),
  catalogBuilders: vi.fn(),
  catalogActorCount: vi.fn(),
  catalogActors: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    blogPost: { findMany: mocks.blog },
    changelogEntry: { findMany: mocks.changelog },
    storeActor: {
      groupBy: mocks.catalogBuilders,
      count: mocks.catalogActorCount,
      findMany: mocks.catalogActors,
    },
  },
}));
import { sitemapRoutes } from "../../src/routes/sitemap";
const app = new Hono().route("/public/sitemap", sitemapRoutes);
beforeEach(() => vi.clearAllMocks());

describe("published sitemap feeds", () => {
  it("only requests published, non-deleted blogs and exposes no author/content fields", async () => {
    mocks.blog.mockResolvedValue([
      { id: "one", slug: "post", updatedAt: new Date("2026-10-23T00:00:00Z") },
    ]);
    const response = await app.request("/public/sitemap/blog");
    expect(response.status).toBe(200);
    expect(mocks.blog).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PUBLISHED", deletedAt: null },
        take: 501,
        select: { id: true, slug: true, updatedAt: true },
      }),
    );
    expect(await response.json()).toEqual({
      ok: true,
      data: { items: [{ slug: "post", updatedAt: "2026-10-23T00:00:00.000Z" }], nextCursor: null },
    });
  });
  it("pages through changelog articles across all years and only includes published slugs", async () => {
    mocks.changelog.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => ({
        id: `entry-${index}`,
        slug: `update-${index}`,
        updatedAt: new Date(),
      })),
    );
    const response = await app.request("/public/sitemap/changelog?cursor=previous");
    expect(mocks.changelog).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPublished: true, slug: { not: null }, id: { gt: "previous" } },
        orderBy: { id: "asc" },
      }),
    );
    const body = await response.json();
    expect(body.data.items).toHaveLength(500);
    expect(body.data.nextCursor).toBe("entry-499");
  });
  it("rejects invalid cursors before querying the database", async () => {
    expect((await app.request("/public/sitemap/blog?cursor=")).status).toBe(400);
    expect(mocks.blog).not.toHaveBeenCalled();
  });

  it("lists catalog shards and only queries rows within the requested shard", async () => {
    mocks.catalogBuilders.mockResolvedValue([{ username: "builder" }]);
    mocks.catalogActorCount.mockResolvedValue(5_001);
    mocks.catalogActors.mockResolvedValue([
      { username: "apify", actorName: "website-content-crawler" },
      { username: "builder", actorName: ".." },
    ]);
    const manifest = await app.request("/public/sitemap/catalog");
    expect(await manifest.json()).toEqual({ ok: true, data: { builders: 1, actors: 2 } });
    const actorPage = await app.request("/public/sitemap/catalog/actors/2");
    expect(actorPage.status).toBe(200);
    expect(actorPage.headers.get("content-type")).toMatch(/^application\/xml/);
    expect(await actorPage.text()).toMatch(
      /\/builders\/apify\/actors\/website-content-crawler<\/loc>/,
    );
    expect(mocks.catalogActors).toHaveBeenCalledWith({
      where: {
        isPublic: true,
        isDeprecated: false,
        apifyActorId: { not: { contains: "/" } },
        username: { not: "compare" },
      },
      orderBy: { id: "asc" },
      skip: 5_000,
      take: 5_000,
      select: { username: true, actorName: true },
    });
    expect((await app.request("/public/sitemap/catalog/actors/3")).status).toBe(404);
    expect((await app.request("/public/sitemap/catalog/actors/0")).status).toBe(400);
    expect(mocks.catalogActors).toHaveBeenCalledTimes(1);
  });
});
