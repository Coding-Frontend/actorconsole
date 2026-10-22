import { Hono } from "hono";
import { db } from "@actorconsole/db";
import { requireAuth } from "../middleware/auth.js";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../app.js";

/**
 * Public announcements API — no auth required for GET /active.
 * POST /:id/dismiss requires authentication.
 */
export const announcementRoutes = new Hono<AppEnv>()
  // Get the most recent active announcement (optionally dismiss-aware if user has session cookie)
  .get("/active", async (c) => {
    const now = new Date();
    // Try to identify the user from session cookie without failing if absent
    let userId: string | undefined;
    try {
      const sessionToken =
        getCookie(c, "authjs.session-token") ?? getCookie(c, "__Secure-authjs.session-token");
      if (sessionToken) {
        const session = await db.session.findUnique({
          where: { sessionToken },
          select: { userId: true, expires: true },
        });
        if (session && session.expires > new Date()) {
          userId = session.userId;
        }
      }
    } catch {
      userId = undefined;
    }

    const announcement = await db.announcement.findFirst({
      where: {
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
    });

    if (!announcement) {
      return c.json({ ok: true, data: null });
    }

    // Check if user has dismissed it
    if (userId) {
      const dismissal = await db.announcementDismissal.findUnique({
        where: { userId_announcementId: { userId, announcementId: announcement.id } },
      });
      if (dismissal) {
        return c.json({ ok: true, data: null });
      }
    }

    return c.json({
      ok: true,
      data: {
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        emoji: announcement.emoji,
        linkUrl: announcement.linkUrl,
        linkLabel: announcement.linkLabel,
        createdAt: announcement.createdAt,
      },
    });
  })

  // Dismiss an announcement
  .post("/:id/dismiss", requireAuth(), async (c) => {
    const userId = c.get("session")!.userId;
    const id = c.req.param("id")!;
    await db.announcementDismissal.upsert({
      where: { userId_announcementId: { announcementId: id, userId } },
      create: { announcementId: id, userId },
      update: {},
    });

    return c.json({ ok: true });
  });
