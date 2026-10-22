import { estimateActorEarnings, rollupEarnings } from "@actorconsole/shared/actor-earnings";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomUUID } from "node:crypto";
import { db, Prisma } from "@actorconsole/db";
import { z } from "zod";
import type { AppEnv } from "../app.js";
import { businessProfileScope } from "../lib/business-profile.js";
import { AppError } from "../middleware/error.js";
import { requireInteractiveSession } from "../middleware/auth.js";
import { calculateProfitability, profitabilityRange } from "../lib/profitability.js";

const identifier = z.string().trim().min(1).max(100);
const costSchema = z.object({
  eventId: identifier.optional(),
  runId: identifier.optional(),
  source: z.string().trim().min(1).max(100),
  amountUsd: z.number().finite().min(0.000001).max(1000000),
  incurredAt: z.string().datetime().optional(),
});
async function body<S extends z.ZodTypeAny>(
  c: { req: { json: () => Promise<unknown> } },
  schema: S,
): Promise<z.output<S>> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    throw new AppError("INVALID_JSON", "Enter valid JSON.", 400);
  }
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      "INVALID_INPUT",
      result.error.issues.map((item) => `${item.path.join(".")}: ${item.message}`).join("; "),
      400,
    );
  return result.data;
}
export const intelligenceRoutes = new Hono<AppEnv>();
intelligenceRoutes.use("*", bodyLimit({ maxSize: 65536 }));
// Workspace intelligence is only available to interactive workspace sessions.
intelligenceRoutes.use("*", requireInteractiveSession());

async function ownedActor(actorId: string, businessProfileId: string) {
  const actor = await db.actor.findFirst({
    where: { id: actorId, businessProfileId },
    select: { id: true, title: true, actorName: true, apifyActorId: true },
  });
  if (!actor) throw new AppError("NOT_FOUND", "Actor not found in this workspace.", 404);
  return actor;
}

intelligenceRoutes.get("/actors", async (c) => {
  const actors = await db.actor.findMany({
    where: { businessProfileId: businessProfileScope(c.get("session")).businessProfileId },
    orderBy: { actorName: "asc" },
    select: {
      id: true,
      actorName: true,
      title: true,
      apifyActorId: true,
    },
  });
  return c.json({ ok: true, data: actors });
});

intelligenceRoutes.get("/earnings", async (c) => {
  const actors = await db.actor.findMany({
    where: { businessProfileId: businessProfileScope(c.get("session")).businessProfileId },
    orderBy: { actorName: "asc" },
    select: { id: true, title: true, actorName: true, username: true, apifyActorId: true },
  });
  const catalog = actors.length
    ? await db.storeActor.findMany({
        where: {
          apifyActorId: { in: actors.map((actor) => actor.apifyActorId) },
          isPublic: true,
          isDeprecated: false,
        },
        select: {
          apifyActorId: true,
          pricingInfos: true,
          users30Days: true,
          runs30Days: true,
          lastSeenAt: true,
        },
      })
    : [];
  const byId = new Map(catalog.map((actor) => [actor.apifyActorId, actor]));
  const items = actors.map((actor) => {
    const listing = byId.get(actor.apifyActorId);
    return {
      id: actor.id,
      title: actor.title,
      actorName: actor.actorName,
      username: actor.username,
      users30Days: listing?.users30Days ?? null,
      runs30Days: listing?.runs30Days ?? null,
      lastSeenAt: listing?.lastSeenAt ?? null,
      earnings: estimateActorEarnings({
        pricingInfos: listing?.pricingInfos,
        users30Days: listing?.users30Days ?? null,
        runs30Days: listing?.runs30Days ?? null,
      }),
    };
  });
  c.header("Cache-Control", "no-store");
  return c.json({
    ok: true,
    data: {
      summary: rollupEarnings(items.map((actor) => actor.earnings)),
      items,
      users30Days: items.reduce((sum, actor) => sum + (actor.users30Days ?? 0), 0),
      reportedUserActors: items.filter((actor) => actor.users30Days != null).length,
    },
  });
});

intelligenceRoutes.get("/costs", async (c) => {
  c.header("Cache-Control", "no-store");
  const { from, to, since, until } = profitabilityRange(c.req.query("from"), c.req.query("to"));
  const where = {
    actor: { businessProfileId: businessProfileScope(c.get("session")).businessProfileId },
    ...(c.req.query("actor") ? { actorId: c.req.query("actor") } : {}),
    incurredAt: {
      gte: since,
      lt: until,
    },
  };
  const requestedPage = Math.max(1, Math.min(10000, Math.floor(Number(c.req.query("page")) || 1)));
  const [total, sum, byActor] = await Promise.all([
    db.actorExternalCost.count({ where }),
    db.actorExternalCost.aggregate({ where, _sum: { amountUsd: true } }),
    db.actorExternalCost.groupBy({
      by: ["actorId"],
      where,
      _sum: { amountUsd: true },
      _count: { _all: true },
    }),
  ]);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / 50)));
  const items = await db.actorExternalCost.findMany({
    where,
    take: 50,
    skip: (page - 1) * 50,
    orderBy: [{ incurredAt: "desc" }, { id: "desc" }],
    include: { actor: { select: { title: true, actorName: true } } },
  });
  return c.json({
    ok: true,
    data: {
      items,
      total,
      totalUsd: Number(sum._sum.amountUsd ?? 0),
      byActor,
      page,
      pageSize: 50,
      from,
      to,
      coverage:
        "Recorded external expenses only. An empty ledger does not confirm zero external cost.",
    },
  });
});
intelligenceRoutes.post("/actors/:id/costs", async (c) => {
  const actor = await ownedActor(
    c.req.param("id"),
    businessProfileScope(c.get("session")).businessProfileId,
  );
  const input = await body(c, costSchema);
  const item = await db.actorExternalCost.create({
    data: {
      actorId: actor.id,
      eventId: input.eventId ?? randomUUID(),
      runId: input.runId,
      source: input.source,
      amountUsd: input.amountUsd,
      incurredAt: input.incurredAt ? new Date(input.incurredAt) : new Date(),
    },
  });
  return c.json({ ok: true, data: item }, 201);
});
intelligenceRoutes.delete("/costs/:id", async (c) => {
  const result = await db.actorExternalCost.deleteMany({
    where: {
      id: c.req.param("id"),
      actor: { businessProfileId: businessProfileScope(c.get("session")).businessProfileId },
    },
  });
  if (!result.count) throw new AppError("NOT_FOUND", "Expense not found.", 404);
  return c.json({ ok: true });
});

intelligenceRoutes.get("/watches", async (c) => {
  const items = await db.storeWatch.findMany({
    where: { businessProfileId: businessProfileScope(c.get("session")).businessProfileId },
    orderBy: { createdAt: "desc" },
    include: { storeActor: true },
  });
  return c.json({ ok: true, data: items });
});
intelligenceRoutes.post("/watches", async (c) => {
  const input = await body(c, z.object({ storeActorId: identifier }));
  const workspace = businessProfileScope(c.get("session")).businessProfileId;
  const existing = await db.storeWatch.findUnique({
    where: {
      businessProfileId_storeActorId: {
        businessProfileId: workspace,
        storeActorId: input.storeActorId,
      },
    },
  });
  if (existing) return c.json({ ok: true, data: existing });
  if ((await db.storeWatch.count({ where: { businessProfileId: workspace } })) >= 100)
    throw new AppError("WATCH_LIMIT", "A workspace can watch up to 100 Actors.", 409);
  const actor = await db.storeActor.findFirst({
    where: { id: input.storeActorId, isPublic: true, isDeprecated: false },
  });
  if (!actor) throw new AppError("NOT_FOUND", "Public Actor not found.", 404);
  const rank =
    actor.users30Days == null
      ? null
      : 1 +
        (await db.storeActor.count({
          where: {
            isPublic: true,
            isDeprecated: false,
            apifyActorId: { not: { contains: "/" } },
            OR: [
              { users30Days: { gt: actor.users30Days } },
              { users30Days: actor.users30Days, id: { lt: actor.id } },
            ],
          },
        }));
  const baseline = {
    users30Days: actor.users30Days,
    runs30Days: actor.runs30Days,
    reviewRating: actor.reviewRating,
    pricing: actor.pricingInfos,
    isPublic: actor.isPublic,
    rank,
  };
  const watch = await db.storeWatch.upsert({
    where: {
      businessProfileId_storeActorId: { businessProfileId: workspace, storeActorId: actor.id },
    },
    create: {
      businessProfileId: workspace,
      storeActorId: actor.id,
      baseline: baseline as Prisma.InputJsonValue,
    },
    update: {},
  });
  return c.json({ ok: true, data: watch }, 201);
});
intelligenceRoutes.patch("/watches/:id", async (c) => {
  const input = await body(c, z.object({ alertsEnabled: z.boolean() }));
  const updated = await db.storeWatch.updateMany({
    where: {
      id: c.req.param("id"),
      businessProfileId: businessProfileScope(c.get("session")).businessProfileId,
    },
    data: input,
  });
  if (!updated.count) throw new AppError("NOT_FOUND", "Watch not found.", 404);
  return c.json({ ok: true });
});
intelligenceRoutes.delete("/watches/:id", async (c) => {
  await db.storeWatch.deleteMany({
    where: {
      id: c.req.param("id"),
      businessProfileId: businessProfileScope(c.get("session")).businessProfileId,
    },
  });
  return c.json({ ok: true });
});

intelligenceRoutes.get("/profitability", async (c) => {
  c.header("Cache-Control", "no-store");
  const range = profitabilityRange(c.req.query("from"), c.req.query("to"));
  const { from, to, since, until } = range;
  const actors = await db.actor.findMany({
    where: {
      businessProfileId: businessProfileScope(c.get("session")).businessProfileId,
      ...(c.req.query("actor") ? { id: c.req.query("actor") } : {}),
    },
    orderBy: [{ actorName: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      actorName: true,
      insightSnapshots: {
        where: { capturedOn: { gte: since, lt: until } },
        select: { revenueUsd: true, costUsd: true, capturedOn: true, monetization: true },
      },
      externalCosts: {
        where: { incurredAt: { gte: since, lt: until } },
        select: { amountUsd: true, incurredAt: true },
      },
    },
  });
  const items = actors.map((actor) => ({
    id: actor.id,
    title: actor.title ?? actor.actorName,
    actorName: actor.actorName,
    ...calculateProfitability(actor.insightSnapshots, actor.externalCosts, range),
  }));
  return c.json({
    ok: true,
    data: {
      items,
      from,
      to,
      coverage:
        "Profit = paying-user revenue − Apify cost − recorded external expenses on the same UTC days. Partial results cover only days with both revenue and cost; missing days are never treated as zero. Expenses on other days remain in the ledger and export. Account allocations, taxes, and unrecorded expenses are excluded; an empty ledger does not confirm zero external cost.",
    },
  });
});
