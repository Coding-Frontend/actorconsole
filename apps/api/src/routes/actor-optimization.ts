import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createHash } from "node:crypto";
import { db, Prisma } from "@actorconsole/db";
import { actorOptimizationFieldSchema } from "@actorconsole/shared";
import { AppError } from "../middleware/error.js";
import { assertFeatureEnabled, assertPlanFeature } from "../lib/plan-access.js";
import { businessProfileScope } from "../lib/business-profile.js";
import { enqueue } from "../lib/queue.js";
import { recordUserAudit } from "../lib/user-audit.js";
import { assertApiKeyActorScope, assertApiKeyCapability } from "../middleware/api-key-scope.js";
import type { AppEnv } from "../app.js";

const optimizationRunKindSchema = z.enum([
  "GENERATE_IMPROVEMENTS",
  "REWRITE_COPY",
  "UPDATE_PRICING",
  "CUSTOM",
]);

const supportedFields = ["title", "description", "pricing"] as const;
const supportedFieldSchema = z.enum(supportedFields);
const defaultImprovementFields = ["title", "description"] as const;

const createRunSchema = z.object({
  actorIds: z
    .array(z.string().min(1))
    .min(1)
    .max(10_000)
    .transform((ids) => [...new Set(ids)]),
  kind: optimizationRunKindSchema.default("GENERATE_IMPROVEMENTS"),
  fields: z
    .array(supportedFieldSchema)
    .min(1)
    .max(supportedFields.length)
    .transform((fields) => [...new Set(fields)])
    .default([...defaultImprovementFields]),
});

const approveRunSchema = z.object({
  items: z
    .array(
      z.object({
        resultId: z.string().min(1),
        fields: z
          .array(supportedFieldSchema)
          .min(1)
          .max(supportedFields.length)
          .transform((fields) => [...new Set(fields)]),
      }),
    )
    .min(1)
    .max(10_000),
});

export const actorOptimizationRoutes: Hono<AppEnv> = new Hono<AppEnv>()
  .get(
    "/optimization/summary",
    zValidator("query", z.object({ actorIds: z.string().min(1).max(10_000) })),
    async (c) => {
      const session = c.get("session");
      assertApiKeyCapability(session, "actors:optimize");
      const actorIds = [...new Set(c.req.valid("query").actorIds.split(",").filter(Boolean))].slice(
        0,
        100,
      );
      const results = await db.actorOptimizationResult.findMany({
        where: {
          actorId: { in: actorIds },
          actor: {
            userId: session.userId,
            ...businessProfileScope(session),
            ...(session.apiKeyActorIds?.length
              ? { apifyActorId: { in: session.apiKeyActorIds } }
              : {}),
          },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          runId: true,
          actorId: true,
          status: true,
          currentScore: true,
          proposedScore: true,
          improvementPoints: true,
          improvementPercent: true,
          createdAt: true,
        },
      });
      const latest = new Map<string, (typeof results)[number]>();
      for (const result of results)
        if (!latest.has(result.actorId)) latest.set(result.actorId, result);
      return c.json({ ok: true, data: [...latest.values()] });
    },
  )
  .get(
    "/optimization/runs",
    zValidator(
      "query",
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        kind: optimizationRunKindSchema.optional(),
        status: z.string().trim().min(1).max(50).optional(),
      }),
    ),
    async (c) => {
      const session = c.get("session");
      assertApiKeyCapability(session, "actors:optimize");
      const { page, limit, kind, status } = c.req.valid("query");
      const where = {
        userId: session.userId,
        ...businessProfileScope(session),
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
        ...(session.apiKeyActorIds?.length
          ? {
              results: {
                some: { actor: { apifyActorId: { in: session.apiKeyActorIds } } },
              },
            }
          : {}),
      };
      const [items, total] = await db.$transaction([
        db.actorOptimizationRun.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            results: {
              ...(session.apiKeyActorIds?.length
                ? { where: { actor: { apifyActorId: { in: session.apiKeyActorIds } } } }
                : {}),
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                status: true,
                currentScore: true,
                proposedScore: true,
                actor: {
                  select: { id: true, actorName: true, title: true, username: true },
                },
              },
            },
          },
        }),
        db.actorOptimizationRun.count({ where }),
      ]);
      return c.json({ ok: true, data: { items, total, page, limit } });
    },
  )
  .post("/optimization/runs", zValidator("json", createRunSchema), async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "actors:optimize");
    if (!session.businessProfileId)
      throw new AppError("workspace_required", "Select a workspace first", 409);
    await assertPlanFeature(session, "ai_copy");
    await assertFeatureEnabled("kill_switch_ai_rewrite", session.userId);
    const { actorIds, kind, fields } = c.req.valid("json");
    if (fields.includes("pricing")) {
      await assertPlanFeature(session, "pricing_recommendations");
      await assertFeatureEnabled("pro_pricing_experiments", session.userId);
    }
    const actors = await db.actor.findMany({
      where: {
        userId: session.userId,
        businessProfileId: session.businessProfileId,
        OR: [{ id: { in: actorIds } }, { apifyActorId: { in: actorIds } }],
      },
      select: { id: true, apifyActorId: true },
    });
    if (actors.length !== actorIds.length) {
      throw new AppError(
        "invalid_actor_selection",
        "One or more selected Actors are unavailable",
        400,
      );
    }
    for (const actor of actors) assertApiKeyActorScope(session, actor.apifyActorId);

    const run = await db.actorOptimizationRun.create({
      data: {
        userId: session.userId,
        businessProfileId: session.businessProfileId,
        kind,
        requestedFields: fields as Prisma.InputJsonValue,
        totalCount: actors.length,
        results: { create: actors.map((actor) => ({ actorId: actor.id })) },
      },
      include: { results: { select: { id: true, actorId: true } } },
    });

    const queued = await Promise.all(
      run.results.map(async (result) => ({
        result,
        jobId: await enqueue(
          "optimization",
          { action: "audit", resultId: result.id },
          { jobId: `actor-optimization-audit-${result.id}` },
        ).catch(() => null),
      })),
    );
    const failed = queued.filter((item) => !item.jobId);
    if (failed.length > 0) {
      await db.$transaction([
        db.actorOptimizationResult.updateMany({
          where: { id: { in: failed.map((item) => item.result.id) } },
          data: { status: "FAILED", error: "The optimization queue is unavailable" },
        }),
        db.actorOptimizationRun.update({
          where: { id: run.id },
          data: {
            failedCount: failed.length,
            status: failed.length === actors.length ? "FAILED" : "RUNNING",
          },
        }),
      ]);
    }
    if (failed.length === actors.length) {
      throw new AppError("queue_unavailable", "The Actor optimization queue is unavailable", 503);
    }
    await recordUserAudit(
      c,
      session,
      "actor.optimization.started",
      `actor-optimization:${run.id}`,
      {
        actorCount: actors.length,
        kind,
        fields,
      },
    );
    return c.json(
      { ok: true, data: { runId: run.id, queued: actors.length - failed.length } },
      202,
    );
  })
  .get("/optimization/runs/:runId", async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "actors:optimize");
    const run = await db.actorOptimizationRun.findFirst({
      where: { id: c.req.param("runId"), userId: session.userId, ...businessProfileScope(session) },
      include: {
        results: {
          orderBy: { createdAt: "asc" },
          include: {
            actor: {
              select: {
                id: true,
                apifyActorId: true,
                username: true,
                actorName: true,
                title: true,
              },
            },
          },
        },
      },
    });
    if (!run) throw new AppError("not_found", "Optimization run not found", 404);
    for (const result of run.results) {
      assertApiKeyActorScope(session, result.actor.apifyActorId);
    }
    return c.json({
      ok: true,
      data: {
        ...run,
        results: run.results.map((result) => ({
          ...result,
          proposal: {
            proposalId: result.id,
            currentValue: result.currentState,
            proposedValue: result.proposedState,
            explanation: result.issues,
            validationWarnings: result.issues,
            metadataFingerprint: result.metadataFingerprint,
          },
        })),
      },
    });
  })
  .post("/optimization/runs/:runId/approve", zValidator("json", approveRunSchema), async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "ai_copy");
    assertApiKeyCapability(session, "actors:write");
    const run = await db.actorOptimizationRun.findFirst({
      where: { id: c.req.param("runId"), userId: session.userId, ...businessProfileScope(session) },
      include: { results: { include: { actor: { select: { apifyActorId: true } } } } },
    });
    if (!run) throw new AppError("not_found", "Optimization run not found", 404);
    for (const result of run.results) assertApiKeyActorScope(session, result.actor.apifyActorId);
    const { items } = c.req.valid("json");
    const idempotencyKey = c.req.header("idempotency-key")?.trim().slice(0, 191);
    if (session.authMethod === "api-key" && !idempotencyKey) {
      throw new AppError(
        "idempotency_key_required",
        "apply_actor_changes requires an Idempotency-Key header",
        400,
      );
    }
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify(
          items
            .map((item) => ({ resultId: item.resultId, fields: [...item.fields].sort() }))
            .sort((left, right) => left.resultId.localeCompare(right.resultId)),
        ),
      )
      .digest("hex");
    if (run.approvalIdempotencyKey) {
      if (
        run.approvalIdempotencyKey === idempotencyKey &&
        run.approvalRequestHash === requestHash
      ) {
        return c.json({
          ok: true,
          data: { queued: items.length, failed: 0, idempotentReplay: true, runId: run.id },
        });
      }
      if (run.approvalIdempotencyKey === idempotencyKey) {
        throw new AppError(
          "idempotency_conflict",
          "This idempotency key was already used with a different approval payload",
          409,
        );
      }
    }
    const resultById = new Map(run.results.map((result) => [result.id, result]));
    const requestedFields = new Set(
      (Array.isArray(run.requestedFields) ? run.requestedFields : defaultImprovementFields).filter(
        (field): field is z.infer<typeof actorOptimizationFieldSchema> =>
          actorOptimizationFieldSchema.safeParse(field).success,
      ),
    );
    for (const item of items) {
      const result = resultById.get(item.resultId);
      if (!result || result.status !== "READY_FOR_APPROVAL") {
        throw new AppError(
          "invalid_approval",
          "Every approved proposal must belong to this run and be ready for approval",
          409,
        );
      }
      if (item.fields.some((field) => !requestedFields.has(field))) {
        throw new AppError(
          "invalid_approval",
          "Only fields requested by this generation run can be approved",
          409,
        );
      }
    }

    const now = new Date();
    await db.$transaction([
      ...items.map((item) =>
        db.actorOptimizationResult.update({
          where: { id: item.resultId },
          data: {
            status: "APPROVED",
            approvedFields: item.fields as Prisma.InputJsonValue,
            approvedAt: now,
            error: null,
          },
        }),
      ),
      db.actorOptimizationRun.update({
        where: { id: run.id },
        data: {
          status: "APPLYING",
          approvedAt: now,
          approvalIdempotencyKey: idempotencyKey,
          approvalRequestHash: requestHash,
        },
      }),
    ]);

    const queued = await Promise.all(
      items.map(async (item) => ({
        item,
        jobId: await enqueue(
          "optimization",
          { action: "apply", resultId: item.resultId },
          { jobId: `actor-optimization-apply-${item.resultId}` },
        ).catch(() => null),
      })),
    );
    const failed = queued.filter((item) => !item.jobId);
    if (failed.length > 0) {
      await db.$transaction([
        db.actorOptimizationResult.updateMany({
          where: { id: { in: failed.map(({ item }) => item.resultId) } },
          data: { status: "APPLY_FAILED", error: "The optimization queue is unavailable" },
        }),
        ...(failed.length === items.length
          ? [
              db.actorOptimizationRun.update({
                where: { id: run.id },
                data: { status: "PARTIALLY_APPLIED", appliedAt: new Date() },
              }),
            ]
          : []),
      ]);
    }
    await recordUserAudit(
      c,
      session,
      "actor.optimization.approved",
      `actor-optimization:${run.id}`,
      {
        items: items.map((item) => ({ resultId: item.resultId, fields: item.fields })),
        idempotencyKey,
      },
    );
    return c.json(
      {
        ok: true,
        data: {
          queued: items.length - failed.length,
          failed: failed.length,
          idempotentReplay: false,
          runId: run.id,
        },
      },
      202,
    );
  })
  .post("/optimization/results/:resultId/recheck", async (c) => {
    const session = c.get("session");
    await assertPlanFeature(session, "ai_copy");
    assertApiKeyCapability(session, "actors:optimize");
    const result = await db.actorOptimizationResult.findFirst({
      where: {
        id: c.req.param("resultId"),
        run: { userId: session.userId, ...businessProfileScope(session) },
      },
      include: { actor: { select: { apifyActorId: true } } },
    });
    if (!result) throw new AppError("not_found", "Optimization result not found", 404);
    assertApiKeyActorScope(session, result.actor.apifyActorId);
    if (!["READY_FOR_APPROVAL", "FAILED", "APPLY_FAILED", "STALE", "APPLIED"].includes(result.status)) {
      throw new AppError("invalid_recheck", "Wait for this Actor's current operation to finish", 409);
    }
    await db.$transaction(async (tx) => {
      // Claim the exact result version before adjusting counters. Two recheck
      // requests must not queue parallel audits or decrement the same count.
      const claimed = await tx.actorOptimizationResult.updateMany({
        where: { id: result.id, status: result.status, updatedAt: result.updatedAt },
        data: {
          status: "QUEUED",
          error: null,
          approvedFields: Prisma.JsonNull,
          approvedAt: null,
          appliedAt: null,
        },
      });
      if (claimed.count !== 1) {
        throw new AppError("invalid_recheck", "This Actor's operation has already changed", 409);
      }
      await tx.actorOptimizationRun.update({
        where: { id: result.runId },
        data: {
          status: "RUNNING",
          completedAt: null,
          appliedAt: null,
          ...(result.status === "APPLIED" ? { appliedCount: { decrement: 1 } } : {}),
          ...(result.status === "FAILED"
            ? { failedCount: { decrement: 1 } }
            : { completedCount: { decrement: 1 } }),
        },
      });
    });
    const jobId = await enqueue(
      "optimization",
      { action: "audit", resultId: result.id },
      { jobId: `actor-optimization-recheck-${result.id}-${Date.now()}` },
    ).catch(() => null);
    if (!jobId) {
      await db.$transaction(async (tx) => {
        await tx.actorOptimizationResult.update({
          where: { id: result.id },
          data: { status: "FAILED", error: "The optimization queue is unavailable" },
        });
        const run = await tx.actorOptimizationRun.update({
          where: { id: result.runId },
          data: { failedCount: { increment: 1 } },
        });
        if (run.completedCount + run.failedCount >= run.totalCount) {
          await tx.actorOptimizationRun.update({
            where: { id: result.runId },
            data: {
              status: run.completedCount > 0 ? "READY_FOR_APPROVAL" : "FAILED",
              completedAt: new Date(),
            },
          });
        }
      });
      throw new AppError("queue_unavailable", "The Actor optimization queue is unavailable", 503);
    }
    return c.json({ ok: true, data: { jobId } }, 202);
  });
