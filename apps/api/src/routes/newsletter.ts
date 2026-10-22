/**
 * Newsletter routes — public subscribe + authenticated unsubscribe.
 *
 * POST /api/newsletter/subscribe  — anyone can subscribe (rate-limited)
 * GET  /api/newsletter/unsubscribe?token=xxx — one-click unsubscribe
 * POST /api/newsletter/unsubscribe  — authenticated unsubscribe
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@actorconsole/db";
import { randomBytes } from "crypto";
import { checkRateLimit } from "../lib/rate-limit.js";
import type { AppEnv } from "../app.js";
import { stringQuery } from "../lib/query.js";
import { requireAuth } from "../middleware/auth.js";

function generateUnsubscribeToken(): string {
  return randomBytes(32).toString("hex");
}

const subscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
});

export const newsletterRoutes = new Hono<AppEnv>()

  // ---- Public: Subscribe ----
  .post("/subscribe", zValidator("json", subscribeSchema), async (c) => {
    const body = c.req.valid("json");

    // Rate limit: 3 subscribes per email per hour
    const rate = await checkRateLimit(`newsletter:sub:${body.email}`, {
      label: "Newsletter subscribe",
      windowMs: 3600000,
      max: 3,
    });
    if (!rate.allowed) {
      return c.json(
        {
          ok: false,
          error: { code: "rate_limited", message: "Too many requests. Try again later." },
        },
        429,
      );
    }

    // Upsert: if already subscribed, just return success
    const existing = await db.newsletterSubscriber.findUnique({
      where: { email: body.email },
    });

    if (existing?.status === "ACTIVE") {
      return c.json({ ok: true, message: "Already subscribed!" });
    }

    if (existing?.status === "UNSUBSCRIBED") {
      // Re-subscribe
      await db.newsletterSubscriber.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          name: body.name ?? existing.name,
          unsubscribedAt: null,
        },
      });
      return c.json({ ok: true, message: "Welcome back! You've been re-subscribed." });
    }

    // Create new subscriber
    await db.newsletterSubscriber.create({
      data: {
        email: body.email,
        name: body.name,
        token: generateUnsubscribeToken(),
      },
    });

    return c.json({ ok: true, message: "Subscribed! Check your inbox for a welcome email." }, 201);
  })

  // ---- Public: Unsubscribe via token (GET, for email links) ----
  .get("/unsubscribe", async (c) => {
    const token = stringQuery(c.req.query("token"), "token", 128);
    if (!token) {
      return c.json(
        { ok: false, error: { code: "missing_token", message: "Unsubscribe token is required." } },
        400,
      );
    }

    const subscriber = await db.newsletterSubscriber.findUnique({
      where: { token },
    });

    if (!subscriber) {
      return c.json(
        { ok: false, error: { code: "invalid_token", message: "Invalid unsubscribe link." } },
        404,
      );
    }

    if (subscriber.status === "UNSUBSCRIBED") {
      return c.json({ ok: true, message: "Already unsubscribed." });
    }

    await db.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        status: "UNSUBSCRIBED",
        unsubscribedAt: new Date(),
      },
    });

    return c.json({ ok: true, message: "You've been unsubscribed. We'll miss you!" });
  })

  // ---- Authenticated: Unsubscribe by email ----
  .post("/unsubscribe", requireAuth(), async (c) => {
    const session = c.get("session");
    const subscriber = await db.newsletterSubscriber.findUnique({
      where: { email: session.email },
    });

    if (!subscriber || subscriber.status !== "ACTIVE") {
      return c.json(
        {
          ok: false,
          error: { code: "not_subscribed", message: "You're not currently subscribed." },
        },
        404,
      );
    }

    await db.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        status: "UNSUBSCRIBED",
        unsubscribedAt: new Date(),
      },
    });

    return c.json({ ok: true, message: "Unsubscribed successfully." });
  });
