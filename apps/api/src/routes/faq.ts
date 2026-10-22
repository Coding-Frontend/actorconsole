import { Hono } from "hono";
import { db } from "@actorconsole/db";
import type { AppEnv } from "../app.js";

/**
 * Public FAQ API — no auth required.
 * Returns published FAQ items grouped by category.
 */
export const faqRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const items = await db.faqItem.findMany({
      where: { published: true },
      orderBy: [{ category: "asc" }, { order: "asc" }],
      select: {
        id: true,
        question: true,
        answer: true,
        category: true,
      },
    });

    // Group by category
    const grouped: Record<string, typeof items> = {};
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }

    return c.json(
      {
        ok: true,
        data: {
          groups: Object.entries(grouped).map(([category, items]) => ({
            category,
            items,
          })),
        },
      },
      200,
      {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    );
  })

  .get("/pricing", async (c) => {
    const items = await db.faqItem.findMany({
      where: {
        published: true,
        category: { in: ["pricing", "Pricing"] },
      },
      orderBy: { order: "asc" },
      select: { id: true, question: true, answer: true },
    });

    return c.json({ ok: true, data: items }, 200, {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    });
  });
