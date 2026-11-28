import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  applyActorLogoRecommendation,
  db,
  LogoApplyError,
  logoBatchItemOutcome,
  type Prisma,
} from "@actorconsole/db";
import { getUserApifyClient } from "@actorconsole/apify";
import { readWebsiteLogo } from "@actorconsole/logo-catalog";
import { logoApplyBatchJobId } from "@actorconsole/shared";
import { AppError } from "../middleware/error.js";
import { enqueue } from "../lib/queue.js";
import { getLogger } from "@actorconsole/shared";
import { businessProfileScope } from "../lib/business-profile.js";
import { booleanQuery, enumQuery, integerQuery, limitQuery, stringQuery } from "../lib/query.js";
import { recordUserAudit } from "../lib/user-audit.js";
import { assertApiKeyActorScope } from "../middleware/api-key-scope.js";
import type { AppEnv } from "../app.js";

const recommendationStatuses = ["PENDING", "APPLIED", "DISMISSED", "SUPERSEDED"] as const;
const visibleStatuses = ["PENDING", "APPLIED", "DISMISSED"];

type Session = AppEnv["Variables"]["session"];

/** Actors this session may act on: its workspace and, for API keys, their Actor scope. */
function workspaceActorScope(session: Session): Prisma.ActorWhereInput {
  return {
    userId: session.userId,
    ...businessProfileScope(session),
    apifyRemovedAt: null,
    ...(session.authMethod === "api-key" && session.apiKeyActorIds?.length
      ? { apifyActorId: { in: session.apiKeyActorIds } }
      : {}),
  };
}

function apifyClientFor(session: Session) {
  return session.businessProfileId
    ? getUserApifyClient(session.userId, session.businessProfileId)
    : getUserApifyClient(session.userId);
}

/** Audit writes run after the Apify change, so they must never fail the request. */
async function auditSafely(...args: Parameters<typeof recordUserAudit>) {
  try {
    await recordUserAudit(...args);
  } catch (error) {
    logger.warn({ err: error, action: args[2] }, "Could not record logo audit entry");
  }
}

const logger = getLogger("api:logo-recommendations");
const idsBody = z.object({ ids: z.array(z.string().min(1).max(191)).min(1).max(5_000) });
const ACTIVE_BATCH_STATUSES = ["QUEUED", "RUNNING"];

function recommendationFilters(c: Context<AppEnv>) {
  const session = c.get("session");
  const query = stringQuery(c.req.query("q"), "q", 200);
  const websiteId = stringQuery(c.req.query("websiteId"), "websiteId", 191);
  const thumbnail = enumQuery(c.req.query("thumbnail"), "thumbnail", [
    "all",
    "missing",
    "existing",
  ]);
  const actorScope = workspaceActorScope(session);
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
  .post("/logo-recommendations/dismiss", zValidator("json", idsBody), async (c) => {
    const session = c.get("session");
    const ids = [...new Set(c.req.valid("json").ids)];
    const where = { status: "PENDING", actor: workspaceActorScope(session) };
    const eligible = await db.actorLogoRecommendation.findMany({
      where: { ...where, id: { in: ids } },
      select: { id: true },
    });
    const eligibleIds = eligible.map((item) => item.id);
    // Conditional on PENDING so an apply that claimed a row meanwhile wins.
    await db.actorLogoRecommendation.updateMany({
      where: { ...where, id: { in: eligibleIds } },
      data: { status: "DISMISSED", dismissedAt: new Date(), error: null },
    });
    const dismissed = (
      await db.actorLogoRecommendation.findMany({
        where: { id: { in: eligibleIds }, status: "DISMISSED" },
        select: { id: true },
      })
    ).map((item) => item.id);
    if (dismissed.length) {
      await auditSafely(c, session, "actor.logo.bulk_dismissed", "actors", {
        recommendationIds: dismissed,
      });
    }
    return c.json({ ok: true, data: { dismissed } });
  })
  .post("/logo-recommendations/:id/dismiss", async (c) => {
    const session = c.get("session");
    const item = await db.actorLogoRecommendation.findFirst({
      where: { id: c.req.param("id"), status: "PENDING", actor: workspaceActorScope(session) },
      include: { actor: { select: { apifyActorId: true } } },
    });
    if (!item) throw new AppError("not_found", "Logo recommendation not found", 404);
    assertApiKeyActorScope(session, item.actor.apifyActorId);
    // Conditional on PENDING so an apply that claimed the row meanwhile wins.
    const result = await db.actorLogoRecommendation.updateMany({
      where: { id: item.id, status: "PENDING" },
      data: { status: "DISMISSED", dismissedAt: new Date(), error: null },
    });
    if (!result.count) throw new AppError("not_found", "Logo recommendation not found", 404);
    await auditSafely(c, session, "actor.logo.dismissed", `actor:${item.actorId}`, {
      recommendationId: item.id,
    });
    const updated = await db.actorLogoRecommendation.findUniqueOrThrow({ where: { id: item.id } });
    return c.json({ ok: true, data: updated });
  })
  .post("/logo-recommendations/:id/apply", async (c) => {
    const session = c.get("session");
    // Resolve the Actor first so an API key scoped to other Actors gets a
    // clear 403 before anything is claimed or uploaded.
    const target = await db.actorLogoRecommendation.findFirst({
      where: {
        id: c.req.param("id"),
        actor: { userId: session.userId, ...businessProfileScope(session), apifyRemovedAt: null },
      },
      select: { actor: { select: { apifyActorId: true } } },
    });
    if (!target) throw new AppError("not_found", "Logo recommendation not found", 404);
    assertApiKeyActorScope(session, target.actor.apifyActorId);
    let applied: Awaited<ReturnType<typeof applyActorLogoRecommendation>>;
    try {
      applied = await applyActorLogoRecommendation({
        recommendationId: c.req.param("id"),
        actorWhere: workspaceActorScope(session),
        getApify: () => apifyClientFor(session),
        readLogo: readWebsiteLogo,
      });
    } catch (error) {
      if (error instanceof LogoApplyError) {
        throw new AppError(
          error.code,
          error.message,
          error.status,
          error.code === "apify_publishing_credentials_required"
            ? { link: "/dashboard/apify" }
            : undefined,
        );
      }
      throw error;
    }
    await auditSafely(c, session, "actor.logo.applied", `actor:${applied.actorId}`, {
      recommendationId: c.req.param("id"),
      logoId: applied.logoId,
    });
    return c.json({ ok: true, data: { pictureUrl: applied.pictureUrl } });
  })
  // Bulk apply runs in the background worker, so it keeps going when the
  // reviewer closes the page and is not bound by the proxy's request timeout.
  .post("/logo-recommendations/batches", zValidator("json", idsBody), async (c) => {
    const session = c.get("session");
    const businessProfileId = session.businessProfileId;
    if (!businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace before applying logos", 400);
    }
    const ids = [...new Set(c.req.valid("json").ids)];
    if (!(await apifyClientFor(session))) {
      throw new AppError(
        "apify_publishing_credentials_required",
        "Reconnect your Apify publishing credential before applying logos",
        409,
        { link: "/dashboard/apify" },
      );
    }
    const batch = await db.$transaction(async (tx) => {
      const created = await tx.actorLogoApplyBatch.create({
        data: { userId: session.userId, businessProfileId, total: 0 },
      });
      const queued = await tx.actorLogoRecommendation.updateMany({
        where: { id: { in: ids }, status: "PENDING", actor: workspaceActorScope(session) },
        data: { status: "QUEUED", batchId: created.id, error: null },
      });
      return tx.actorLogoApplyBatch.update({
        where: { id: created.id },
        data: {
          total: queued.count,
          jobId: logoApplyBatchJobId(created.id),
          ...(queued.count ? {} : { status: "COMPLETED", completedAt: new Date() }),
        },
      });
    });
    if (!batch.total) {
      throw new AppError(
        "logo_recommendation_superseded",
        "None of the selected logos are waiting for review any more. Refresh the list.",
        409,
      );
    }
    try {
      await enqueue(
        "schedules",
        { logoApplyBatch: { batchId: batch.id, userId: session.userId, businessProfileId } },
        { jobId: batch.jobId! },
      );
    } catch (error) {
      // The QUEUED batch row is the durable intent; the worker tick re-dispatches it.
      logger.warn({ err: error, batchId: batch.id }, "Logo apply batch enqueue is pending");
    }
    await auditSafely(c, session, "actor.logo.bulk_apply_queued", "actors", {
      batchId: batch.id,
      queued: batch.total,
    });
    return c.json({ ok: true, data: await batchView(batch.id, businessProfileId) }, 202);
  })
  .get("/logo-recommendations/batches/active", async (c) => {
    const session = c.get("session");
    const batch = session.businessProfileId
      ? await db.actorLogoApplyBatch.findFirst({
          where: {
            userId: session.userId,
            businessProfileId: session.businessProfileId,
            status: { in: ACTIVE_BATCH_STATUSES },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      : null;
    return c.json({
      ok: true,
      data: {
        batch: batch ? await batchView(batch.id, session.businessProfileId!) : null,
        workspaceId: session.businessProfileId,
      },
    });
  })
  .get("/logo-recommendations/batches/:batchId", async (c) => {
    const session = c.get("session");
    const view = session.businessProfileId
      ? await batchView(c.req.param("batchId"), session.businessProfileId, session.userId)
      : null;
    if (!view) throw new AppError("not_found", "Logo apply batch not found", 404);
    return c.json({ ok: true, data: view });
  })
  .post("/logo-recommendations/batches/:batchId/stop", async (c) => {
    const session = c.get("session");
    const batch = await db.actorLogoApplyBatch.findFirst({
      where: {
        id: c.req.param("batchId"),
        userId: session.userId,
        businessProfileId: session.businessProfileId ?? "",
      },
    });
    if (!batch) throw new AppError("not_found", "Logo apply batch not found", 404);
    if (ACTIVE_BATCH_STATUSES.includes(batch.status)) {
      // Release everything not yet started; the worker finishes the current Actor.
      await db.$transaction([
        db.actorLogoApplyBatch.update({ where: { id: batch.id }, data: { stopRequested: true } }),
        db.actorLogoRecommendation.updateMany({
          where: { batchId: batch.id, status: "QUEUED" },
          data: { status: "PENDING", batchId: null },
        }),
        db.actorLogoApplyBatch.updateMany({
          where: { id: batch.id, status: "QUEUED" },
          data: { status: "STOPPED", completedAt: new Date() },
        }),
      ]);
      await auditSafely(c, session, "actor.logo.bulk_apply_stopped", "actors", {
        batchId: batch.id,
      });
    }
    return c.json({ ok: true, data: await batchView(batch.id, batch.businessProfileId) });
  });

async function batchView(batchId: string, businessProfileId: string, userId?: string) {
  const batch = await db.actorLogoApplyBatch.findFirst({
    where: { id: batchId, businessProfileId, ...(userId ? { userId } : {}) },
  });
  if (!batch) return null;
  const items = await db.actorLogoRecommendation.findMany({
    where: { batchId },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      status: true,
      error: true,
      actor: { select: { id: true, actorName: true, title: true } },
    },
  });
  return {
    id: batch.id,
    status: batch.status,
    total: batch.total,
    stopRequested: batch.stopRequested,
    error: batch.error,
    createdAt: batch.createdAt,
    completedAt: batch.completedAt,
    workspaceId: businessProfileId,
    items: items.map((item) => ({
      id: item.id,
      actor: item.actor,
      outcome: logoBatchItemOutcome(item),
      // Failed rows go back to PENDING and can be applied again.
      retryable: item.status === "PENDING",
      ...(item.status === "APPLIED" || !item.error ? {} : { message: item.error }),
    })),
  };
}
