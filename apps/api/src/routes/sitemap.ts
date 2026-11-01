import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@actorconsole/db";

const querySchema = z.object({ cursor: z.string().min(1).max(191).optional() });
const PAGE_SIZE = 500;

/** Small, public, keyset-paginated feeds; never expose draft content or author data. */
export const sitemapRoutes = new Hono()
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
