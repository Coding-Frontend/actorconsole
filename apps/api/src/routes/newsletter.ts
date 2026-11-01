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
import { createHash, randomBytes } from "node:crypto";
import { getAppBaseUrl } from "@actorconsole/shared";
import { sendEmail, escapeHtml } from "../lib/email.js";
import { resolveClientIp } from "../lib/client-ip.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import type { AppEnv } from "../app.js";
import { stringQuery } from "../lib/query.js";
import { requireAuth } from "../middleware/auth.js";

function generateUnsubscribeToken(): string {
  return randomBytes(32).toString("hex");
}

const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().max(100).optional(),
});

export const newsletterRoutes = new Hono<AppEnv>()

  // ---- Public: Subscribe ----
  .post("/subscribe", zValidator("json", subscribeSchema), async (c) => {
    const body = c.req.valid("json");
    const requester = await checkRateLimit(`newsletter:requester:${resolveClientIp(c)}`, { windowMs: 3600000, max: 10 });
    if (!requester.allowed) return c.json({ ok: false, error: { code: "rate_limited" } }, 429);

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

    const response = () => c.json({ ok: true, message: "Check your inbox to confirm your subscription, if eligible." });
    if (existing?.status === "ACTIVE" || existing?.status === "BOUNCED") return response();
    const confirmationToken = randomBytes(32).toString("hex");
    const confirmation = {
      confirmationTokenHash: createHash("sha256").update(confirmationToken).digest("hex"),
      confirmationExpiresAt: new Date(Date.now() + 30 * 60_000),
    };
    if (existing) {
      // Keep durable opt-out intact until the mailbox owner redeems this grant.
      const claim = await db.newsletterSubscriber.updateMany({
        where: { id: existing.id, status: { in: ["UNSUBSCRIBED", "PENDING"] } },
        data: confirmation,
      });
      if (!claim.count) return response();
    } else {
      try {
        await db.newsletterSubscriber.create({ data: {
          email: body.email, name: body.name, status: "PENDING",
          token: generateUnsubscribeToken(), ...confirmation,
        } });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") return response();
        throw error;
      }
    }
    const link = `${getAppBaseUrl()}/api/newsletter/confirm?token=${confirmationToken}`;
    await sendEmail({ to: body.email, subject: "Confirm your ActorConsole newsletter subscription",
      html: `<p>Confirm that you want to receive the ActorConsole newsletter.</p><p><a href="${escapeHtml(link)}">Confirm subscription</a></p><p>This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>`,
    });
    return response();
  })

  // A GET only displays a confirmation; email scanners cannot subscribe anyone.
  .get("/confirm", (c) => {
    if (!/^[a-f0-9]{64}$/.test(c.req.query("token") ?? "")) return c.text("Invalid confirmation link", 400);
    c.header("cache-control", "no-store");
    c.header("referrer-policy", "no-referrer");
    c.header("content-security-policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    return c.html('<!doctype html><html lang="en"><meta charset="utf-8"><title>Confirm newsletter subscription</title><h1>ActorConsole newsletter</h1><p>Confirm that you want to receive our newsletter.</p><form method="post"><button type="submit">Confirm subscription</button></form></html>');
  })
  .post("/confirm", async (c) => {
    c.header("cache-control", "no-store");
    const token = c.req.query("token") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token)) return c.text("Invalid confirmation link", 400);
    const result = await db.newsletterSubscriber.updateMany({
      where: { confirmationTokenHash: createHash("sha256").update(token).digest("hex"),
        confirmationExpiresAt: { gt: new Date() }, status: { in: ["PENDING", "UNSUBSCRIBED"] } },
      data: { status: "ACTIVE", subscribedAt: new Date(), unsubscribedAt: null,
        confirmationTokenHash: null, confirmationExpiresAt: null },
    });
    return result.count ? c.text("Your newsletter subscription is confirmed.") : c.text("This confirmation link has expired or has already been used.", 400);
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
      await db.newsletterSubscriber.update({ where: { id: subscriber.id }, data: { confirmationTokenHash: null, confirmationExpiresAt: null } });
      return c.json({ ok: true, message: "Already unsubscribed." });
    }

    await db.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: {
        status: "UNSUBSCRIBED",
        unsubscribedAt: new Date(),
        confirmationTokenHash: null,
        confirmationExpiresAt: null,
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
        confirmationTokenHash: null,
        confirmationExpiresAt: null,
      },
    });

    return c.json({ ok: true, message: "Unsubscribed successfully." });
  });
