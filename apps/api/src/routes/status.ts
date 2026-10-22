import { Hono } from "hono";
import { db } from "@actorconsole/db";
import type { AppEnv } from "../app.js";
import { limitQuery } from "../lib/query.js";

/**
 * Public status API — no auth required.
 * Returns current system status and recent incidents for the status page.
 */
export const statusRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const [activeIncidents, recentResolved] = await Promise.all([
      db.incident.findMany({
        where: { status: { not: "resolved" } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.incident.findMany({
        where: { status: "resolved" },
        orderBy: { resolvedAt: "desc" },
        take: 20,
      }),
    ]);

    return c.json(
      {
        ok: true,
        data: {
          status: activeIncidents.length === 0 ? "operational" : "degraded",
          activeIncidents: activeIncidents.length,
          incidents: {
            active: activeIncidents,
            recent: recentResolved,
          },
          services: [
            { name: "API", status: "operational" },
            { name: "Database", status: "operational" },
          ],
        },
      },
      200,
      {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    );
  })

  .get("/incidents", async (c) => {
    const limit = limitQuery(c.req.query("limit"), 20, 50);
    const incidents = await db.incident.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return c.json({ ok: true, data: incidents }, 200, {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    });
  });
