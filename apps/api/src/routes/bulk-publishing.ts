import { createHash } from "node:crypto";
import { bulkActorStatusJobId } from "@actorconsole/shared";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import cronParser from "cron-parser";
import { z } from "zod";
import { db } from "@actorconsole/db";
import { getUserApifyClient } from "@actorconsole/apify";
import { AppError } from "../middleware/error.js";
import { businessProfileScope } from "../lib/business-profile.js";
import { assertPlanFeature } from "../lib/plan-access.js";
import { recordUserAudit } from "../lib/user-audit.js";
import { enqueue, getQueuedJob } from "../lib/queue.js";
import {
  assertApiKeyActorScope,
  assertApiKeyCapability,
  assertApiKeyUnscoped,
} from "../middleware/api-key-scope.js";
import type { AppEnv } from "../app.js";

const actorStatusSchema = z.enum([
  "all",
  "published",
  "private",
  "maintenance",
  "deprecated",
  "healthy",
]);

const actorReadinessSchema = z.enum([
  "all",
  "ready",
  "needs-attention",
  "unknown",
  "missing-description",
  "missing-readme",
  "missing-input-schema",
  "missing-output-schema",
  "missing-key-value-store-schema",
  "missing-tagged-build",
  "missing-public-profile",
  "email-not-verified",
  "disposable-email",
]);

const scheduleInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  actorIds: z.array(z.string().min(1)).min(1).max(10_000),
  cronExpr: z.string().trim().min(9).max(100).default("0 2 * * *"),
  dailyLimit: z.number().int().min(1).max(100).default(5),
  enabled: z.boolean().default(false),
  idempotencyKey: z.string().trim().min(1).max(191).optional(),
});

const scheduleUpdateSchema = scheduleInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

function nextCronDate(cronExpr: string) {
  try {
    return cronParser.parseExpression(cronExpr, { utc: true }).next().toDate();
  } catch {
    throw new AppError("invalid_cron", "Invalid cron expression", 400);
  }
}

const APIFY_API_UNHEALTHY_STATUSES = new Set(["EXPIRED", "INVALID", "ERROR"]);

async function requireApifyPublishingApiKey(session: AppEnv["Variables"]["session"]) {
  if (!session.businessProfileId) {
    throw new AppError("workspace_required", "Select a workspace before using publishing", 409);
  }
  const credentials = await db.apifyToken.findUnique({
    where: { businessProfileId: session.businessProfileId },
    select: { encryptedToken: true, apiTokenStatus: true, validationError: true },
  });
  if (!credentials?.encryptedToken) {
    throw new AppError(
      "apify_api_key_required",
      "Connect an Apify API key before creating or running a publishing schedule. Console tokens or cookies alone cannot publish Actors.",
      409,
    );
  }
  if (APIFY_API_UNHEALTHY_STATUSES.has(String(credentials.apiTokenStatus ?? "").toUpperCase())) {
    throw new AppError(
      "apify_api_key_unavailable",
      credentials.validationError ??
        "The connected Apify API key is not available. Update it before running a publishing schedule.",
      409,
    );
  }
}

function normalizeActorStatusChange(input: { underMaintenance?: boolean; isDeprecated?: boolean }) {
  if (input.underMaintenance === false && input.isDeprecated === true) {
    throw new AppError(
      "invalid_status_change",
      "Clearing maintenance also clears deprecated status",
      400,
    );
  }
  const underMaintenance = input.underMaintenance;
  const isDeprecated = underMaintenance === false ? false : input.isDeprecated;
  const action =
    underMaintenance === false
      ? "CLEAR_MAINTENANCE"
      : underMaintenance === true
        ? "MARK_MAINTENANCE"
        : isDeprecated === false
          ? "CLEAR_DEPRECATED"
          : "MARK_DEPRECATED";
  return { action, underMaintenance, isDeprecated };
}

function statusWhere(status: z.infer<typeof actorStatusSchema>) {
  switch (status) {
    case "published":
      // Visibility, maintenance, and deprecation are independent Apify
      // lifecycle fields. A public Actor can still be deprecated or under
      // maintenance, so the visibility filters must not silently exclude it.
      return { storeIsPublic: true };
    case "private":
      return { storeIsPublic: false };
    case "maintenance":
      return { storeNotice: "UNDER_MAINTENANCE" };
    case "deprecated":
      return { storeIsDeprecated: true };
    case "healthy":
      return { storeIsDeprecated: false, NOT: { storeNotice: "UNDER_MAINTENANCE" } };
    default:
      return {};
  }
}

function readinessWhere(readiness: z.infer<typeof actorReadinessSchema>) {
  switch (readiness) {
    case "ready":
      return { publishReady: true };
    case "needs-attention":
      return {
        OR: [
          { publishReady: false },
          { hasDescription: false },
          { hasInputSchema: false },
          { hasOutputSchema: false },
          { hasKeyValueSchema: false },
          { hasTaggedBuild: false },
          { hasPublicProfile: false },
          { hasVerifiedEmail: false },
          { hasNonDisposableEmail: false },
        ],
      };
    case "unknown":
      return { OR: [{ readinessSyncedAt: null }, { publishReady: null }] };
    case "missing-description":
      return { hasDescription: false };
    case "missing-readme":
      return { hasReadme: false };
    case "missing-input-schema":
      return { hasInputSchema: false };
    case "missing-output-schema":
      return { hasOutputSchema: false };
    case "missing-key-value-store-schema":
      return { hasKeyValueSchema: false };
    case "missing-tagged-build":
      return { hasTaggedBuild: false };
    case "missing-public-profile":
      return { hasPublicProfile: false };
    case "email-not-verified":
      return { hasVerifiedEmail: false };
    case "disposable-email":
      return { hasNonDisposableEmail: false };
    default:
      return {};
  }
}

function inventoryActorSelect() {
  return {
    id: true,
    apifyActorId: true,
    username: true,
    actorName: true,
    title: true,
    currentImageUrl: true,
    storeIsPublic: true,
    storeIsDeprecated: true,
    storeNotice: true,
    storeStatusSyncedAt: true,
    publishReady: true,
    hasDescription: true,
    hasReadme: true,
    hasInputSchema: true,
    hasOutputSchema: true,
    hasKeyValueSchema: true,
    hasTaggedBuild: true,
    hasPublicProfile: true,
    hasVerifiedEmail: true,
    hasNonDisposableEmail: true,
    readinessSyncedAt: true,
  } as const;
}

function inventoryWhere(input: {
  userId: string;
  businessProfileId: string;
  q: string;
  status: z.infer<typeof actorStatusSchema>;
  readiness: z.infer<typeof actorReadinessSchema>;
}) {
  return {
    userId: input.userId,
    businessProfileId: input.businessProfileId,
    apifyRemovedAt: null,
    AND: [
      statusWhere(input.status),
      readinessWhere(input.readiness),
      ...(input.q
        ? [
            {
              OR: [
                { title: { contains: input.q } },
                { actorName: { contains: input.q } },
                { username: { contains: input.q } },
              ],
            },
          ]
        : []),
    ],
  };
}

async function requireWorkspaceActors(session: AppEnv["Variables"]["session"], actorIds: string[]) {
  const uniqueIds = [...new Set(actorIds)];
  const actors = await db.actor.findMany({
    where: {
      id: { in: uniqueIds },
      userId: session.userId,
      businessProfileId: session.businessProfileId!,
      apifyRemovedAt: null,
    },
  });
  if (actors.length !== uniqueIds.length) {
    throw new AppError("not_found", "One or more selected Actors were not found", 404);
  }
  for (const actor of actors) assertApiKeyActorScope(session, actor.apifyActorId);
  return actors;
}

async function requireOwnedSchedule(session: AppEnv["Variables"]["session"], scheduleId: string) {
  const schedule = await db.bulkPublishSchedule.findFirst({
    where: { id: scheduleId, userId: session.userId, ...businessProfileScope(session) },
    include: {
      actors: {
        include: { actor: { select: { apifyActorId: true } } },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!schedule) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
  for (const item of schedule.actors ?? []) {
    if (item.actor?.apifyActorId) assertApiKeyActorScope(session, item.actor.apifyActorId);
  }
  return schedule;
}

export const bulkPublishingRoutes = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    const isMutation = !["GET", "HEAD"].includes(c.req.method.toUpperCase());
    if (isMutation && c.req.header("x-actorconsole-client") === "mcp") {
      const idempotencyKey = c.req.header("idempotency-key")?.trim();
      if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 191) {
        throw new AppError(
          "idempotency_key_required",
          "MCP publishing mutations require an Idempotency-Key header (8-191 characters)",
          400,
        );
      }
    }
    await next();
  })
  .get("/inventory", async (c) => {
    const session = c.get("session");
    const businessProfileId = session.businessProfileId!;
    const q = (c.req.query("q") ?? "").trim().slice(0, 120);
    const status = actorStatusSchema.catch("all").parse(c.req.query("status"));
    const readiness = actorReadinessSchema.catch("all").parse(c.req.query("readiness"));
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const limit = Math.min(500, Math.max(1, Number(c.req.query("limit")) || 25));

    const where = inventoryWhere({
      userId: session.userId,
      businessProfileId,
      q,
      status,
      readiness,
    });
    if (session.apiKeyActorIds?.length) {
      Object.assign(where, { apifyActorId: { in: session.apiKeyActorIds } });
    }
    const [items, total] = await Promise.all([
      db.actor.findMany({
        where,
        orderBy: [{ title: "asc" }, { actorName: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: inventoryActorSelect(),
      }),
      db.actor.count({ where }),
    ]);
    return c.json({
      ok: true,
      data: { items, total, page, limit, status, readiness },
    });
  })

  .post("/inventory/refresh", async (c) => {
    const session = c.get("session");
    assertApiKeyUnscoped(session);
    const businessProfileId = session.businessProfileId!;
    const apify = await getUserApifyClient(session.userId, businessProfileId);
    if (!apify) throw new AppError("apify_not_connected", "Connect Apify first", 400);
    const fiveMinuteBucket = Math.floor(Date.now() / (5 * 60_000));
    const jobId = await enqueue(
      "snapshots",
      {
        workspaceInventory: {
          userId: session.userId,
          businessProfileId,
        },
      },
      {
        // Inventory refreshes must jump ahead of the long-running insight
        // bootstrap backlog. BullMQ's FIFO wait list is the shared queue for
        // those jobs; using LIFO here places this user-requested refresh at
        // the head that the worker consumes next instead of waiting behind
        // hundreds of actor snapshots.
        jobId: `publishing-inventory-${businessProfileId}-${fiveMinuteBucket}`,
        lifo: true,
      },
    );
    if (!jobId) {
      throw new AppError("queue_unavailable", "The publishing inventory queue is unavailable", 503);
    }
    return c.json({ ok: true, data: { jobId, state: "queued" } }, 202);
  })

  .get("/inventory/refresh/:jobId", async (c) => {
    const session = c.get("session");
    const job = await getQueuedJob("snapshots", c.req.param("jobId"));
    if (!job) throw new AppError("not_found", "Publishing inventory refresh was not found", 404);
    const workspace = (
      job.data as { workspaceInventory?: { userId?: string; businessProfileId?: string } }
    ).workspaceInventory;
    if (
      workspace?.userId !== session.userId ||
      workspace.businessProfileId !== session.businessProfileId
    ) {
      throw new AppError("not_found", "Publishing inventory refresh was not found", 404);
    }
    return c.json({
      ok: true,
      data: {
        jobId: String(job.id),
        state: await job.getState(),
        progress: job.progress,
        result: job.returnvalue ?? null,
        error: job.failedReason || null,
      },
    });
  })

  .get("/inventory/selection", async (c) => {
    const session = c.get("session");
    const q = (c.req.query("q") ?? "").trim().slice(0, 120);
    const status = actorStatusSchema.catch("all").parse(c.req.query("status"));
    const readiness = actorReadinessSchema.catch("all").parse(c.req.query("readiness"));
    const items = await db.actor.findMany({
      where: {
        ...inventoryWhere({
          userId: session.userId,
          businessProfileId: session.businessProfileId!,
          q,
          status,
          readiness,
        }),
        ...(session.apiKeyActorIds?.length ? { apifyActorId: { in: session.apiKeyActorIds } } : {}),
      },
      orderBy: [{ title: "asc" }, { actorName: "asc" }],
      take: 10_000,
      select: inventoryActorSelect(),
    });
    return c.json({ ok: true, data: { items, total: items.length, status, readiness } });
  })

  .patch(
    "/actors/status",
    zValidator(
      "json",
      z
        .object({
          actorIds: z.array(z.string().min(1)).min(1).max(10_000),
          underMaintenance: z.boolean().optional(),
          isDeprecated: z.boolean().optional(),
        })
        .refine(
          (value) => value.underMaintenance !== undefined || value.isDeprecated !== undefined,
          "Select a status change",
        ),
    ),
    async (c) => {
      const session = c.get("session");
      assertApiKeyCapability(session, "actors:write");
      await assertPlanFeature(session, "publishing");
      const body = c.req.valid("json");
      const businessProfileId = session.businessProfileId!;
      const actors = await requireWorkspaceActors(session, body.actorIds);
      const actorById = new Map(actors.map((actor) => [actor.id, actor]));
      const orderedActors = [...new Set(body.actorIds)].map((actorId) => actorById.get(actorId)!);
      const change = normalizeActorStatusChange(body);
      const rawKey = c.req.header("idempotency-key")?.trim();
      if (rawKey && rawKey.length > 191)
        throw new AppError("invalid_idempotency_key", "Idempotency key is too long", 400);
      const idempotencyKey = rawKey ? createHash("sha256").update(rawKey).digest("hex") : null;
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            actorIds: orderedActors.map((actor) => actor.id).sort(),
            change,
          }),
        )
        .digest("hex");
      const findExisting = () =>
        db.bulkActorStatusOperation.findFirst({
          where: { userId: session.userId, businessProfileId, idempotencyKey },
        });
      let operation = idempotencyKey ? await findExisting() : null;
      if (!operation) {
        try {
          operation = await db.bulkActorStatusOperation.create({
            data: {
              userId: session.userId,
              businessProfileId,
              idempotencyKey,
              requestHash,
              action: change.action,
              underMaintenance: change.underMaintenance,
              isDeprecated: change.isDeprecated,
              actorCount: orderedActors.length,
              items: {
                create: orderedActors.map((actor, position) => ({
                  actorId: actor.id,
                  apifyActorId: actor.apifyActorId,
                  label: actor.title ?? actor.actorName,
                  position,
                })),
              },
            },
          });
        } catch (error) {
          if (
            !idempotencyKey ||
            !error ||
            typeof error !== "object" ||
            !("code" in error) ||
            error.code !== "P2002"
          )
            throw error;
          operation = await findExisting();
          if (!operation) throw error;
        }
      }
      if (operation.requestHash && operation.requestHash !== requestHash) {
        throw new AppError(
          "idempotency_conflict",
          "This idempotency key belongs to a different status operation",
          409,
        );
      }
      const jobId = bulkActorStatusJobId(operation.id);
      let dispatchPending = false;
      if (operation.status === "QUEUED" || !operation.status) {
        await db.bulkActorStatusOperation.update({ where: { id: operation.id }, data: { jobId } });
        try {
          const acknowledged = await enqueue(
            "schedules",
            {
              bulkActorStatus: {
                operationId: operation.id,
                userId: session.userId,
                businessProfileId,
              },
            },
            { jobId },
          );
          dispatchPending = !acknowledged;
        } catch {
          dispatchPending = true;
        }
        if (dispatchPending)
          await db.bulkActorStatusOperation.updateMany({
            where: { id: operation.id, status: "QUEUED" },
            data: {
              error: "Queue acknowledgement is pending; the durable operation will be reconciled.",
            },
          });
      }
      await recordUserAudit(c, session, "actors.bulk-status.updated", "actors", {
        operationId: operation.id,
        actorIds: body.actorIds,
        underMaintenance: change.underMaintenance,
        isDeprecated: change.isDeprecated,
      });
      return c.json(
        {
          ok: true,
          data: {
            jobId,
            dispatchPending,
            operationId: operation.id,
            queued: orderedActors.length,
          },
        },
        202,
      );
    },
  )

  .get("/status-operations", async (c) => {
    const session = c.get("session");
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
    const status = (c.req.query("status") ?? "").trim().toUpperCase();
    const action = (c.req.query("action") ?? "").trim().toUpperCase();
    const where = {
      userId: session.userId,
      ...businessProfileScope(session),
      ...(status ? { status } : {}),
      ...(action ? { action } : {}),
      ...(session.apiKeyActorIds?.length
        ? { items: { every: { apifyActorId: { in: session.apiKeyActorIds } } } }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.bulkActorStatusOperation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.bulkActorStatusOperation.count({ where }),
    ]);
    return c.json({
      ok: true,
      data: { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  })

  .get("/status-operations/:id", async (c) => {
    const session = c.get("session");
    const operation = await db.bulkActorStatusOperation.findFirst({
      where: {
        id: c.req.param("id"),
        userId: session.userId,
        ...businessProfileScope(session),
      },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!operation) throw new AppError("not_found", "Status operation not found", 404);
    for (const item of operation.items) assertApiKeyActorScope(session, item.apifyActorId);
    return c.json({ ok: true, data: operation });
  })

  .get("/operations/:jobId", async (c) => {
    const session = c.get("session");
    const job = await getQueuedJob("schedules", c.req.param("jobId"));
    if (!job) throw new AppError("not_found", "Bulk operation not found", 404);
    const payload = job.data as {
      bulkActorStatus?: { userId?: string; businessProfileId?: string };
      bulkPublishScheduleId?: string;
    };
    const ownsStatusOperation =
      payload.bulkActorStatus?.userId === session.userId &&
      payload.bulkActorStatus?.businessProfileId === session.businessProfileId;
    const ownsScheduleOperation = payload.bulkPublishScheduleId
      ? Boolean(
          await db.bulkPublishSchedule.findFirst({
            where: {
              id: payload.bulkPublishScheduleId,
              userId: session.userId,
              ...businessProfileScope(session),
            },
            select: { id: true },
          }),
        )
      : false;
    if (!ownsStatusOperation && !ownsScheduleOperation) {
      throw new AppError("not_found", "Bulk operation not found", 404);
    }
    return c.json({
      ok: true,
      data: {
        id: String(job.id),
        state: await job.getState(),
        progress: job.progress,
        result: job.returnvalue ?? null,
        error: job.failedReason || null,
      },
    });
  })

  .get("/schedules", async (c) => {
    const session = c.get("session");
    const schedules = await db.bulkPublishSchedule.findMany({
      where: {
        userId: session.userId,
        ...businessProfileScope(session),
        ...(session.apiKeyActorIds?.length
          ? {
              actors: {
                every: { actor: { apifyActorId: { in: session.apiKeyActorIds } } },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        cronExpr: true,
        dailyLimit: true,
        enabled: true,
        lastRunAt: true,
        nextRunAt: true,
        quotaBlockedUntil: true,
        actors: {
          orderBy: { position: "asc" },
          select: {
            actorId: true,
            status: true,
            attemptCount: true,
            lastError: true,
            actor: {
              select: {
                id: true,
                title: true,
                actorName: true,
                username: true,
                apifyActorId: true,
              },
            },
          },
        },
        // Run call results are intentionally fetched by /schedules/:id only
        // when the user expands a schedule.
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            attemptedCount: true,
            publishedCount: true,
            stoppedReason: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
          },
        },
      },
    });
    return c.json({
      ok: true,
      data: schedules.map((schedule) => ({
        ...schedule,
        runs: schedule.runs.map((run) => ({ ...run, result: null })),
      })),
    });
  })

  .get("/schedules/:id", async (c) => {
    const session = c.get("session");
    const schedule = await db.bulkPublishSchedule.findFirst({
      where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
      select: {
        id: true,
        name: true,
        cronExpr: true,
        dailyLimit: true,
        enabled: true,
        lastRunAt: true,
        nextRunAt: true,
        quotaBlockedUntil: true,
        actors: {
          orderBy: { position: "asc" },
          select: {
            actorId: true,
            status: true,
            attemptCount: true,
            lastError: true,
            actor: {
              select: {
                id: true,
                title: true,
                actorName: true,
                username: true,
                apifyActorId: true,
              },
            },
          },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            status: true,
            attemptedCount: true,
            publishedCount: true,
            stoppedReason: true,
            result: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!schedule) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
    for (const item of schedule.actors) assertApiKeyActorScope(session, item.actor.apifyActorId);
    return c.json({ ok: true, data: schedule });
  })

  .post("/schedules", zValidator("json", scheduleInputSchema), async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "publishing");
    const body = c.req.valid("json");
    const businessProfileId = session.businessProfileId!;
    await requireApifyPublishingApiKey(session);
    await requireWorkspaceActors(session, body.actorIds);
    if (body.idempotencyKey) {
      const existing = await db.bulkPublishSchedule.findUnique({
        where: {
          businessProfileId_idempotencyKey: {
            businessProfileId,
            idempotencyKey: body.idempotencyKey,
          },
        },
        include: { actors: { include: { actor: true }, orderBy: { position: "asc" } } },
      });
      if (existing) return c.json({ ok: true, data: existing });
    }
    const schedule = await db.bulkPublishSchedule.create({
      data: {
        userId: session.userId,
        businessProfileId,
        name: body.name,
        cronExpr: body.cronExpr,
        dailyLimit: body.dailyLimit,
        enabled: body.enabled,
        idempotencyKey: body.idempotencyKey,
        nextRunAt: body.enabled ? nextCronDate(body.cronExpr) : null,
        actors: {
          create: [...new Set(body.actorIds)].map((actorId, position) => ({ actorId, position })),
        },
      },
      include: { actors: { include: { actor: true }, orderBy: { position: "asc" } } },
    });
    await recordUserAudit(c, session, "bulk-publish-schedule.created", `schedule:${schedule.id}`, {
      actorCount: schedule.actors.length,
      dailyLimit: schedule.dailyLimit,
    });
    return c.json({ ok: true, data: schedule }, 201);
  })

  .patch("/schedules/:id", zValidator("json", scheduleUpdateSchema), async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "publishing");
    const id = c.req.param("id");
    const body = c.req.valid("json");
    if (body.enabled === true) await requireApifyPublishingApiKey(session);
    await requireOwnedSchedule(session, id);
    const existing = await db.bulkPublishSchedule.findFirst({
      where: { id, userId: session.userId, ...businessProfileScope(session) },
    });
    if (!existing) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
    if (body.actorIds) {
      await requireWorkspaceActors(session, body.actorIds);
    }
    const cronExpr = body.cronExpr ?? existing.cronExpr;
    const enabled = body.enabled ?? existing.enabled;
    const updated = await db.$transaction(async (tx) => {
      if (body.actorIds) {
        await tx.bulkPublishScheduleActor.deleteMany({ where: { scheduleId: id } });
        await tx.bulkPublishScheduleActor.createMany({
          data: [...new Set(body.actorIds)].map((actorId, position) => ({
            scheduleId: id,
            actorId,
            position,
          })),
        });
      }
      return tx.bulkPublishSchedule.update({
        where: { id },
        data: {
          name: body.name,
          cronExpr: body.cronExpr,
          dailyLimit: body.dailyLimit,
          enabled: body.enabled,
          nextRunAt: enabled ? nextCronDate(cronExpr) : null,
          ...(body.actorIds ? { quotaBlockedUntil: null } : {}),
        },
        include: { actors: { include: { actor: true }, orderBy: { position: "asc" } } },
      });
    });
    await recordUserAudit(c, session, "bulk-publish-schedule.updated", `schedule:${id}`);
    return c.json({ ok: true, data: updated });
  })

  .post(
    "/schedules/:id/actors/add",
    zValidator("json", z.object({ actorIds: z.array(z.string().min(1)).min(1).max(10_000) })),
    async (c) => {
      const session = c.get("session");
      await requireOwnedSchedule(session, c.req.param("id"));
      await requireApifyPublishingApiKey(session);
      const schedule = await db.bulkPublishSchedule.findFirst({
        where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
        include: { actors: { orderBy: { position: "desc" }, take: 1 } },
      });
      if (!schedule) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
      const actors = await requireWorkspaceActors(session, c.req.valid("json").actorIds);
      const existingIds = new Set(
        (
          await db.bulkPublishScheduleActor.findMany({
            where: { scheduleId: schedule.id },
            select: { actorId: true },
          })
        ).map((item) => item.actorId),
      );
      const additions = actors.filter((actor) => !existingIds.has(actor.id));
      const start = (schedule.actors[0]?.position ?? -1) + 1;
      if (additions.length) {
        await db.bulkPublishScheduleActor.createMany({
          data: additions.map((actor, index) => ({
            scheduleId: schedule.id,
            actorId: actor.id,
            position: start + index,
          })),
        });
      }
      return c.json({ ok: true, data: { added: additions.length } });
    },
  )

  .post(
    "/schedules/:id/actors/remove",
    zValidator("json", z.object({ actorIds: z.array(z.string().min(1)).min(1).max(10_000) })),
    async (c) => {
      const session = c.get("session");
      await requireOwnedSchedule(session, c.req.param("id"));
      const schedule = await db.bulkPublishSchedule.findFirst({
        where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
        select: { id: true },
      });
      if (!schedule) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
      const actors = await requireWorkspaceActors(session, c.req.valid("json").actorIds);
      const result = await db.bulkPublishScheduleActor.deleteMany({
        where: { scheduleId: schedule.id, actorId: { in: actors.map((actor) => actor.id) } },
      });
      return c.json({ ok: true, data: { removed: result.count } });
    },
  )

  .post("/schedules/:id/pause", async (c) => {
    const session = c.get("session");
    await requireOwnedSchedule(session, c.req.param("id"));
    const result = await db.bulkPublishSchedule.updateMany({
      where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
      data: { enabled: false, nextRunAt: null },
    });
    if (!result.count) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
    return c.json({ ok: true, data: { id: c.req.param("id"), enabled: false } });
  })

  .post("/schedules/:id/resume", async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "publishing");
    await requireOwnedSchedule(session, c.req.param("id"));
    await requireApifyPublishingApiKey(session);
    const schedule = await db.bulkPublishSchedule.findFirst({
      where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
    });
    if (!schedule) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
    const updated = await db.bulkPublishSchedule.update({
      where: { id: schedule.id },
      data: { enabled: true, nextRunAt: nextCronDate(schedule.cronExpr) },
    });
    return c.json({ ok: true, data: updated });
  })

  .get("/schedules/:id/runs", async (c) => {
    const session = c.get("session");
    await requireOwnedSchedule(session, c.req.param("id"));
    const schedule = await db.bulkPublishSchedule.findFirst({
      where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
      select: { id: true },
    });
    if (!schedule) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
    const runs = await db.bulkPublishScheduleRun.findMany({
      where: { scheduleId: schedule.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return c.json({ ok: true, data: runs });
  })

  .get("/schedules/:id/runs/:runId", async (c) => {
    const session = c.get("session");
    await requireOwnedSchedule(session, c.req.param("id"));
    const run = await db.bulkPublishScheduleRun.findFirst({
      where: {
        id: c.req.param("runId"),
        scheduleId: c.req.param("id"),
        schedule: { userId: session.userId, ...businessProfileScope(session) },
      },
      include: { schedule: { select: { id: true, name: true } } },
    });
    if (!run) throw new AppError("not_found", "Publishing run not found", 404);
    return c.json({ ok: true, data: run });
  })

  .post("/schedules/:id/run", async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "publishing");
    await requireOwnedSchedule(session, c.req.param("id"));
    await requireApifyPublishingApiKey(session);
    const schedule = await db.bulkPublishSchedule.findFirst({
      where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
    });
    if (!schedule) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
    const activeRun = await db.bulkPublishScheduleRun.findFirst({
      where: {
        scheduleId: schedule.id,
        status: "RUNNING",
        startedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1_000) },
      },
      select: { id: true },
    });
    if (activeRun) {
      throw new AppError(
        "schedule_already_running",
        "This publishing schedule already has a run in progress.",
        409,
      );
    }
    const idempotencyKey = c.req.header("idempotency-key")?.trim().slice(0, 191);
    const payload = { bulkPublishScheduleId: schedule.id, force: true };
    const jobId = idempotencyKey
      ? await enqueue("schedules", payload, {
          jobId: `bulk-publish-run:${schedule.id}:${idempotencyKey}`,
        })
      : await enqueue("schedules", payload);
    if (!jobId) throw new AppError("queue_unavailable", "The job queue is not configured", 503);
    return c.json({ ok: true, data: { queued: true, jobId } });
  })

  .post("/schedules/:id/actors/:actorId/retry", async (c) => {
    const session = c.get("session");
    await requireOwnedSchedule(session, c.req.param("id"));
    const schedule = await db.bulkPublishSchedule.findFirst({
      where: {
        id: c.req.param("id"),
        userId: session.userId,
        ...businessProfileScope(session),
      },
      select: { id: true },
    });
    if (!schedule) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
    const actorId = c.req.param("actorId");
    const updated = await db.bulkPublishScheduleActor.updateMany({
      where: { scheduleId: schedule.id, actorId, status: { in: ["BLOCKED", "FAILED"] } },
      data: { status: "PENDING", lastError: null },
    });
    if (!updated.count) {
      throw new AppError("not_found", "Blocked Actor was not found in this schedule", 404);
    }
    await db.bulkPublishSchedule.update({
      where: { id: schedule.id },
      data: { quotaBlockedUntil: null },
    });
    await recordUserAudit(
      c,
      session,
      "bulk-publish-schedule.actor-requeued",
      `schedule:${schedule.id}`,
      { actorId },
    );
    return c.json({ ok: true, data: { scheduleId: schedule.id, actorId, status: "PENDING" } });
  })

  .delete("/schedules/:id", async (c) => {
    const session = c.get("session");
    await requireOwnedSchedule(session, c.req.param("id"));
    const result = await db.bulkPublishSchedule.deleteMany({
      where: { id: c.req.param("id"), userId: session.userId, ...businessProfileScope(session) },
    });
    if (!result.count) throw new AppError("not_found", "Bulk publishing schedule not found", 404);
    await recordUserAudit(
      c,
      session,
      "bulk-publish-schedule.deleted",
      `schedule:${c.req.param("id")}`,
    );
    return c.json({ ok: true, data: { id: c.req.param("id") } });
  });
