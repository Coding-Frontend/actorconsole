import { Hono } from "hono";
import { db, type Prisma } from "@actorconsole/db";
import type { AppEnv } from "../app.js";
import { enumQuery, integerQuery, limitQuery } from "../lib/query.js";
import { changelogFeed } from "../lib/changelog-feed.js";
import { apiEnv } from "../config/env.js";
import {
  changelogCategories,
  changelogTags,
  publicChangelogEntry,
  publicChangelogSelect,
} from "../lib/changelog.js";

const cacheHeaders = { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" };

/**
 * Public changelog API — no auth required.
 * Returns published entries grouped by version.
 */
export const changelogRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const limit = limitQuery(c.req.query("limit"), 200, 500);

    const rows = await db.changelogEntry.findMany({
      where: { isPublished: true },
      orderBy: [
        { releaseDate: "desc" },
        { version: "desc" },
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
      take: limit,
      select: {
        id: true,
        version: true,
        releaseDate: true,
        versionSummary: true,
        type: true,
        text: true,
        sortOrder: true,
      },
    });

    // Group by version+releaseDate on the server side
    const releaseMap = new Map<
      string,
      {
        version: string;
        releaseDate: string;
        summary: string | null;
        entries: { id: string; type: string; text: string; sortOrder: number }[];
      }
    >();

    for (const row of rows) {
      const key = `${row.version}|${row.releaseDate.toISOString().slice(0, 10)}`;
      if (!releaseMap.has(key)) {
        releaseMap.set(key, {
          version: row.version,
          releaseDate: row.releaseDate.toISOString().slice(0, 10),
          summary: row.versionSummary ?? null,
          entries: [],
        });
      }
      const release = releaseMap.get(key)!;
      // Denormalized summary: first non-null wins
      if (!release.summary && row.versionSummary) {
        release.summary = row.versionSummary;
      }
      release.entries.push({
        id: row.id,
        type: row.type,
        text: row.text,
        sortOrder: row.sortOrder,
      });
    }

    const releases = Array.from(releaseMap.values());

    return c.json({ ok: true, data: { releases } }, 200, {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    });
  })

  .get("/entries", async (c) => {
    const category = enumQuery(c.req.query("category"), "category", changelogCategories);
    const match = enumQuery(c.req.query("match"), "match", ["any", "all"] as const) ?? "any";
    const tagsResult = changelogTags.safeParse(c.req.queries("tag") ?? []);
    if (!tagsResult.success)
      return c.json(
        { ok: false, error: { code: "invalid_query", message: "Invalid product tags" } },
        400,
      );
    const tags = tagsResult.data;
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 100);
    const requestedYear = c.req.query("year");
    const yearValue =
      requestedYear === undefined
        ? undefined
        : integerQuery(requestedYear, { name: "year", defaultValue: 2026, min: 2000, max: 9998 });

    // Small date aggregates provide complete archives, independent of page size.
    const [archiveDates, tagRows] = await Promise.all([
      db.changelogEntry.groupBy({
        by: ["releaseDate"],
        where: { isPublished: true },
        _count: { id: true },
        orderBy: { releaseDate: "desc" },
      }),
      db.changelogEntryTag.findMany({
        where: { entry: { isPublished: true } },
        select: { tag: true },
        distinct: ["tag"],
        orderBy: { tag: "asc" },
      }),
    ]);
    const years = [...new Set(archiveDates.map((row) => row.releaseDate.getUTCFullYear()))];
    const year = yearValue ?? years[0] ?? new Date().getUTCFullYear();
    const monthValue =
      c.req.query("month") === undefined
        ? undefined
        : integerQuery(c.req.query("month"), { name: "month", defaultValue: 1, max: 12 });
    const where: Prisma.ChangelogEntryWhereInput = {
      isPublished: true,
      releaseDate: {
        gte: new Date(`${year}-01-01T00:00:00Z`),
        lt: new Date(`${year + 1}-01-01T00:00:00Z`),
      },
      ...(category ? { category } : {}),
      ...(tags.length
        ? match === "all"
          ? { AND: tags.map((tag) => ({ tags: { some: { tag } } })) }
          : { tags: { some: { tag: { in: tags } } } }
        : {}),
    };
    const listingWhere: Prisma.ChangelogEntryWhereInput = monthValue
      ? {
          ...where,
          releaseDate: {
            gte: new Date(Date.UTC(year, monthValue - 1, 1)),
            lt: new Date(Date.UTC(year, monthValue, 1)),
          },
        }
      : where;
    const [total, dates] = await Promise.all([
      db.changelogEntry.count({ where: listingWhere }),
      db.changelogEntry.groupBy({
        by: ["releaseDate"],
        where,
        _count: { id: true },
        orderBy: { releaseDate: "desc" },
      }),
    ]);
    const actualPage = Math.min(page, Math.max(1, Math.ceil(total / limit)));
    const rows = await db.changelogEntry.findMany({
      where: listingWhere,
      select: publicChangelogSelect,
      orderBy: [{ releaseDate: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      skip: (actualPage - 1) * limit,
      take: limit,
    });
    const months = new Map<string, number>();
    for (const row of dates) {
      const month = row.releaseDate.toISOString().slice(0, 7);
      months.set(month, (months.get(month) ?? 0) + row._count.id);
    }
    return c.json(
      {
        ok: true,
        data: {
          items: rows.map(publicChangelogEntry),
          total,
          page: actualPage,
          limit,
          year,
          years,
          tags: tagRows.map(({ tag }) => tag),
          months: [...months].map(([month, count]) => ({ month, count })),
        },
      },
      200,
      cacheHeaders,
    );
  })

  .get("/entries/:slug", async (c) => {
    const slug = c.req.param("slug");
    const row = await db.changelogEntry.findFirst({
      where: {
        isPublished: true,
        OR: [{ slug }, ...(slug.startsWith("update-") ? [{ id: slug.slice(7), slug: null }] : [])],
      },
      select: { ...publicChangelogSelect, body: true },
    });
    if (!row)
      return c.json({ ok: false, error: { code: "not_found", message: "Update not found" } }, 404, {
        "Cache-Control": "no-store",
      });
    const related = await db.changelogEntry.findMany({
      where: {
        isPublished: true,
        id: { not: row.id },
        ...(row.tags.length
          ? { tags: { some: { tag: { in: row.tags.map(({ tag }) => tag) } } } }
          : { category: row.category }),
      },
      select: publicChangelogSelect,
      orderBy: [{ releaseDate: "desc" }, { id: "asc" }],
      take: 3,
    });
    return c.json(
      {
        ok: true,
        data: {
          entry: { ...publicChangelogEntry(row), body: row.body || row.text },
          related: related.map(publicChangelogEntry),
        },
      },
      200,
      cacheHeaders,
    );
  })

  .get("/feed", async (c) => {
    const rows = await db.changelogEntry.findMany({
      where: { isPublished: true },
      select: publicChangelogSelect,
      orderBy: [{ releaseDate: "desc" }, { id: "asc" }],
      take: 50,
    });
    return c.json({ ok: true, data: { items: rows.map(publicChangelogEntry) } }, 200, cacheHeaders);
  })
  .get("/rss", async (c) => {
    const rows = await db.changelogEntry.findMany({
      where: { isPublished: true },
      select: publicChangelogSelect,
      orderBy: [{ releaseDate: "desc" }, { id: "asc" }],
      take: 50,
    });
    return c.body(
      changelogFeed(rows.map(publicChangelogEntry), apiEnv.AUTH_URL ?? "http://localhost:8080"),
      200,
      {
        ...cacheHeaders,
        "Content-Type": "application/rss+xml; charset=utf-8",
      },
    );
  })
  .get("/health", (c) => c.json({ ok: true }));
