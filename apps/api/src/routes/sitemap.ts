import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@actorconsole/db";
import { getCatalogSitemapPages, getCatalogSitemapXml } from "../lib/catalog-sitemap.js";

const querySchema = z.object({ cursor: z.string().min(1).max(191).optional() });
const PAGE_SIZE = 500;
const catalogPageSchema = z.object({
  kind: z.enum(["builders", "actors"]),
  page: z
    .string()
    .regex(/^[1-9]\d{0,5}$/)
    .transform(Number),
});
const catalogCache = "public, max-age=300, s-maxage=300";

/** Small, public, keyset-paginated feeds; never expose draft content or author data. */
export const sitemapRoutes = new Hono()
  .get("/catalog", async (c) =>
    c.json({ ok: true, data: await getCatalogSitemapPages() }, 200, {
      "cache-control": catalogCache,
    }),
  )
  .get("/catalog/:kind/:page", zValidator("param", catalogPageSchema), async (c) => {
    const { kind, page } = c.req.valid("param");
    if (page > (await getCatalogSitemapPages())[kind]) return c.notFound();
    const xml = await getCatalogSitemapXml(kind, page);
    if (!xml) return c.notFound();
    return c.body(xml, 200, {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": catalogCache,
    });
  })
  .get("/blog", zValidator("query", querySchema), async (c) => {
    const { cursor } = c.req.valid("query");
    const rows = await db.blogPost.findMany({
      where: { status: "PUBLISHED", deletedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE + 1,
    });
    const items = rows.slice(0, PAGE_SIZE);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      ok: true,
      data: {
        items: items.map(({ slug, updatedAt }) => ({ slug, updatedAt })),
        nextCursor: rows.length > PAGE_SIZE ? items.at(-1)!.id : null,
      },
    });
  })
  .get("/changelog", zValidator("query", querySchema), async (c) => {
    const { cursor } = c.req.valid("query");
    const rows = await db.changelogEntry.findMany({
      where: { isPublished: true, slug: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE + 1,
    });
    const items = rows.slice(0, PAGE_SIZE);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({
      ok: true,
      data: {
        items: items.map(({ slug, updatedAt }) => ({ slug, updatedAt })),
        nextCursor: rows.length > PAGE_SIZE ? items.at(-1)!.id : null,
      },
    });
  });
