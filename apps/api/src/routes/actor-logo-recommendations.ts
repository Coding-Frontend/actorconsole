import { Hono, type Context } from "hono";
import { db, type Prisma } from "@actorconsole/db";
import { getUserApifyClient } from "@actorconsole/apify";
import { readWebsiteLogo } from "@actorconsole/logo-catalog";
import { AppError } from "../middleware/error.js";
import { businessProfileScope } from "../lib/business-profile.js";
import { booleanQuery, enumQuery, integerQuery, limitQuery, stringQuery } from "../lib/query.js";
import { recordUserAudit } from "../lib/user-audit.js";
import { assertApiKeyActorScope } from "../middleware/api-key-scope.js";
import type { AppEnv } from "../app.js";

const recommendationStatuses = ["PENDING", "APPLIED", "DISMISSED", "SUPERSEDED"] as const;
const visibleStatuses = ["PENDING", "APPLIED", "DISMISSED"];

function recommendationFilters(c: Context<AppEnv>) {
  const session = c.get("session");
  const query = stringQuery(c.req.query("q"), "q", 200);
  const websiteId = stringQuery(c.req.query("websiteId"), "websiteId", 191);
  const thumbnail = enumQuery(c.req.query("thumbnail"), "thumbnail", [
    "all",
    "missing",
    "existing",
  ]);
  const actorScope: Prisma.ActorWhereInput = {
    userId: session.userId,
    ...businessProfileScope(session),
    apifyRemovedAt: null,
    ...(session.authMethod === "api-key" && session.apiKeyActorIds?.length
      ? { apifyActorId: { in: session.apiKeyActorIds } }
      : {}),
  };
  const actor: Prisma.ActorWhereInput = {
    ...actorScope,
    ...(thumbnail === "missing"
      ? { OR: [{ currentImageUrl: null }, { currentImageUrl: "" }] }
      : {}),
    ...(thumbnail === "existing"
      ? { currentImageUrl: { not: null }, NOT: { currentImageUrl: "" } }
      : {}),
  };
  const scope: Prisma.ActorLogoRecommendationWhereInput = {
    actor,
    ...(query
      ? {
          OR: [
            { actor: { title: { contains: query } } },
            { actor: { actorName: { contains: query } } },
            { actor: { username: { contains: query } } },
            { logo: { websiteIdentity: { name: { contains: query } } } },
            { logo: { websiteIdentity: { canonicalDomain: { contains: query } } } },
          ],
        }
      : {}),
  };
  return {
    scope,
    websiteScope: { actor: actorScope },
    filtered: {
      ...scope,
      ...(websiteId ? { logo: { websiteIdentityId: websiteId } } : {}),
    } satisfies Prisma.ActorLogoRecommendationWhereInput,
  };
}

export const actorLogoRecommendationRoutes = new Hono<AppEnv>()
  .get("/logo-recommendations", async (c) => {
    const session = c.get("session");
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const status = enumQuery(c.req.query("status"), "status", recommendationStatuses) ?? "PENDING";
    const includeSummary = booleanQuery(c.req.query("summary"), "summary") ?? false;
    const { websiteScope, filtered } = recommendationFilters(c);
    const where = {
      ...filtered,
      status,
    };
    const [items, total, groups, websiteLogos] = await Promise.all([
      db.actorLogoRecommendation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: {
            select: {
              id: true,
              apifyActorId: true,
              title: true,
              actorName: true,
              username: true,
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
      includeSummary
        ? db.actorLogoRecommendation.groupBy({
            by: ["status"],
            where: { ...filtered, status: { in: visibleStatuses } },
            _count: true,
          })
        : null,
      includeSummary
        ? db.actorLogoRecommendation.findMany({
            where: { ...websiteScope, status: { in: visibleStatuses } },
            distinct: ["logoId"],
            select: {
              logo: {
                select: {
                  websiteIdentity: { select: { id: true, name: true, canonicalDomain: true } },
                },
              },
            },
          })
        : null,
    ]);
    const websites = new Map(
      websiteLogos?.map(({ logo }) => [logo.websiteIdentity.id, logo.websiteIdentity]),
    );
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
        workspaceId: session.businessProfileId,
        ...(includeSummary
          ? {
              summary: {
                counts: Object.fromEntries(
                  visibleStatuses.map((value) => [
                    value,
                    groups?.find((group) => group.status === value)?._count ?? 0,
                  ]),
                ),
                websites: [...websites.values()].sort((a, b) => a.name.localeCompare(b.name)),
              },
            }
          : {}),
      },
    });
  })
  .get("/logo-recommendations/selection", async (c) => {
    const session = c.get("session");
    enumQuery(c.req.query("status"), "status", ["PENDING"]);
    const { filtered } = recommendationFilters(c);
    const after = stringQuery(c.req.query("after"), "after", 191);
    const limit = limitQuery(c.req.query("limit"), 200, 200);
    // Cursor through a stable order rather than offsets: another reviewer's
    // actions must not shift unseen rows out of a select-all operation.
    const items = await db.actorLogoRecommendation.findMany({
      where: { ...filtered, status: "PENDING", ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: "asc" },
      take: limit,
      select: {
        id: true,
        actor: { select: { id: true, actorName: true, title: true } },
      },
    });
    return c.json({
      ok: true,
      data: {
        items,
        workspaceId: session.businessProfileId,
        nextCursor: items.length === limit ? items.at(-1)!.id : null,
      },
    });
  })
  .post("/logo-recommendations/:id/dismiss", async (c) => {
    const session = c.get("session");
    const item = await db.actorLogoRecommendation.findFirst({
      where: {
        id: c.req.param("id"),
        status: "PENDING",
        actor: { userId: session.userId, ...businessProfileScope(session), apifyRemovedAt: null },
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
        actor: { userId: session.userId, ...businessProfileScope(session), apifyRemovedAt: null },
      },
      include: {
        actor: { include: { websiteIdentity: { select: { status: true, currentLogoId: true } } } },
        logo: true,
      },
    });
    if (!item) throw new AppError("not_found", "Logo recommendation not found", 404);
    assertApiKeyActorScope(session, item.actor.apifyActorId);
    if (
      item.actor.websiteIdentityId !== item.logo.websiteIdentityId ||
      item.actor.websiteIdentity?.status !== "ACTIVE" ||
      item.actor.websiteIdentity.currentLogoId !== item.logoId ||
      item.logo.reviewStatus !== "APPROVED"
    ) {
      await db.actorLogoRecommendation.update({
        where: { id: item.id },
        data: { status: "SUPERSEDED", error: null },
      });
      throw new AppError(
        "logo_recommendation_superseded",
        "This logo recommendation is no longer current. Refresh the logo recommendations.",
        409,
      );
    }
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
      if (!result.verified || !result.pictureUrl) {
        throw new Error("Apify did not verify the updated thumbnail. Try applying the logo again.");
      }
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
