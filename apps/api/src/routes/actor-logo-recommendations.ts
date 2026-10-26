import { Hono } from "hono";
import { db } from "@actorconsole/db";
import { getUserApifyClient } from "@actorconsole/apify";
import { readWebsiteLogo } from "@actorconsole/logo-catalog";
import { AppError } from "../middleware/error.js";
import { businessProfileScope } from "../lib/business-profile.js";
import { integerQuery, limitQuery } from "../lib/query.js";
import { recordUserAudit } from "../lib/user-audit.js";
import { assertApiKeyActorScope } from "../middleware/api-key-scope.js";
import type { AppEnv } from "../app.js";

export const actorLogoRecommendationRoutes = new Hono<AppEnv>()
  .get("/logo-recommendations", async (c) => {
    const session = c.get("session");
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const status = c.req.query("status") ?? "PENDING";
    const where = {
      status,
      actor: {
        userId: session.userId,
        ...businessProfileScope(session),
        ...(session.authMethod === "api-key" && session.apiKeyActorIds?.length
          ? { apifyActorId: { in: session.apiKeyActorIds } }
          : {}),
      },
    };
    const [items, total] = await Promise.all([
      db.actorLogoRecommendation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: {
            select: {
              id: true,
              apifyActorId: true,
              title: true,
              actorName: true,
              currentImageUrl: true,
            },
          },
          logo: {
            include: {
              websiteIdentity: { select: { id: true, name: true, canonicalDomain: true } },
            },
          },
        },
      }),
      db.actorLogoRecommendation.count({ where }),
    ]);
    return c.json({
      ok: true,
      data: {
        items: items.map((item) => ({
          ...item,
          proposedImageUrl: `/api/website-logo-assets/${item.logoId}`,
        })),
        total,
        page,
        limit,
      },
    });
  })
  .post("/logo-recommendations/:id/dismiss", async (c) => {
    const session = c.get("session");
    const item = await db.actorLogoRecommendation.findFirst({
      where: {
        id: c.req.param("id"),
        status: "PENDING",
        actor: { userId: session.userId, ...businessProfileScope(session) },
      },
      include: { actor: { select: { apifyActorId: true } } },
    });
    if (!item) throw new AppError("not_found", "Logo recommendation not found", 404);
    assertApiKeyActorScope(session, item.actor.apifyActorId);
    const updated = await db.actorLogoRecommendation.update({
      where: { id: item.id },
      data: { status: "DISMISSED", dismissedAt: new Date(), error: null },
    });
    await recordUserAudit(c, session, "actor.logo.dismissed", `actor:${item.actorId}`, {
      recommendationId: item.id,
    });
    return c.json({ ok: true, data: updated });
  })
  .post("/logo-recommendations/:id/apply", async (c) => {
    const session = c.get("session");
    const item = await db.actorLogoRecommendation.findFirst({
      where: {
        id: c.req.param("id"),
        status: "PENDING",
        actor: { userId: session.userId, ...businessProfileScope(session) },
      },
      include: { actor: true, logo: true },
    });
    if (!item) throw new AppError("not_found", "Logo recommendation not found", 404);
    assertApiKeyActorScope(session, item.actor.apifyActorId);
    const apify = session.businessProfileId
      ? await getUserApifyClient(session.userId, session.businessProfileId)
      : await getUserApifyClient(session.userId);
    if (!apify) {
      await db.actorLogoRecommendation.update({
        where: { id: item.id },
        data: { error: "Apify publishing credentials are unavailable or expired" },
      });
      throw new AppError(
        "apify_publishing_credentials_required",
        "Reconnect your Apify publishing credential before applying this logo",
        409,
        { link: "/dashboard/apify" },
      );
    }
    try {
      const bytes = await readWebsiteLogo(item.logo.storagePath);
      const result = await apify.updateActorMetadata(item.actor.apifyActorId, {
        picture: {
          fileName: `${item.logo.checksum.slice(0, 16)}.webp`,
          contentType: item.logo.contentType,
          body: bytes,
        },
      });
      await db.$transaction([
        db.actor.update({
          where: { id: item.actorId },
          data: { currentImageUrl: result.pictureUrl },
        }),
        db.actorLogoRecommendation.update({
          where: { id: item.id },
          data: { status: "APPLIED", appliedAt: new Date(), error: null },
        }),
      ]);
      await recordUserAudit(c, session, "actor.logo.applied", `actor:${item.actorId}`, {
        recommendationId: item.id,
        logoId: item.logoId,
      });
      return c.json({ ok: true, data: { pictureUrl: result.pictureUrl } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Apify rejected the logo update";
      await db.actorLogoRecommendation.update({
        where: { id: item.id },
        data: { error: message.slice(0, 65_535) },
      });
      throw new AppError("apify_logo_update_failed", message, 502);
    }
  });
