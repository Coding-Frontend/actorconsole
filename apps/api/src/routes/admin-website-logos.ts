import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, Prisma, reconcileActorLogoRecommendations } from "@actorconsole/db";
import { downloadLogoSource, storeWebsiteLogo } from "@actorconsole/logo-catalog";
import { getLogger } from "@actorconsole/shared";
import { requireAdmin } from "../middleware/admin.js";
import { AppError } from "../middleware/error.js";
import { enqueue } from "../lib/queue.js";
import { verifiedClientIp } from "../lib/client-ip.js";
import type { AppEnv } from "../app.js";

const log = getLogger("api:admin-website-logos");

/** Record who changed the logo catalog. Never fails the admin action itself. */
async function auditAdmin(c: Context<any>, action: string, resource: string, after?: unknown) {
  const admin = c.get("adminSession");
  try {
    await db.auditLog.create({
      data: {
        adminId: admin?.viaApiKey ? null : (admin?.adminId ?? null),
        action,
        resource,
        after: after as Prisma.InputJsonValue | undefined,
        source: admin?.viaApiKey ? "api-key" : "ui",
        ip: verifiedClientIp(c),
        userAgent: c.req.header("user-agent") ?? null,
      },
    });
  } catch (error) {
    log.warn({ err: error, action }, "Could not record admin logo audit entry");
  }
}

const importBody = z.object({ sourceUrl: z.string().url(), activate: z.boolean().default(false) });
const assignBody = z
  .object({
    actorIds: z.array(z.string().min(1)).max(5_000).default([]),
    workspaceActorIds: z.array(z.string().min(1)).max(5_000).default([]),
  })
  .refine(
    (value) => value.actorIds.length + value.workspaceActorIds.length > 0,
    "Select at least one Actor",
  );
const reclassifyBody = assignBody;
const updateBody = z.object({
  name: z.string().trim().min(1).max(191).optional(),
  canonicalDomain: z.string().trim().max(191).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(191)).max(100).optional(),
  status: z.enum(["ACTIVE", "LOGO_FAILED", "ARCHIVED"]).optional(),
});

function assetUrl(id: string | null | undefined) {
  return id ? `/api/website-logo-assets/${id}` : null;
}

async function activateLogo(websiteId: string, logoId: string, adminId: string | null) {
  const logo = await db.websiteLogo.findFirst({
    where: { id: logoId, websiteIdentityId: websiteId },
  });
  if (!logo) throw new AppError("not_found", "Logo candidate was not found", 404);
  if (logo.reviewStatus === "REJECTED") {
    throw new AppError(
      "logo_rejected",
      "This logo was rejected. Import or upload it again to review it as a new candidate.",
      409,
    );
  }
  const actors = await db.actor.findMany({
    where: { websiteIdentityId: websiteId, apifyRemovedAt: null },
    select: { id: true, userId: true, businessProfileId: true },
  });
  await db.$transaction(async (tx) => {
    const website = await tx.websiteIdentity.findUnique({
      where: { id: websiteId },
      select: { currentLogoId: true, name: true },
    });
    if (!website) throw new AppError("not_found", "Website was not found", 404);
    if (website.currentLogoId && website.currentLogoId !== logoId) {
      await tx.websiteLogo.update({
        where: { id: website.currentLogoId },
        data: { reviewStatus: "RETIRED" },
      });
    }
    await tx.websiteLogo.update({
      where: { id: logoId },
      data: { reviewStatus: "APPROVED", reviewedAt: new Date(), reviewedById: adminId },
    });
    await tx.websiteIdentity.update({
      where: { id: websiteId },
      data: { currentLogoId: logoId, status: "ACTIVE", logoError: null },
    });
    await reconcileActorLogoRecommendations({ websiteIdentityId: websiteId }, tx);
    if (actors.length) {
      const workspaces = new Map<
        string,
        { userId: string; businessProfileId: string; count: number }
      >();
      for (const actor of actors) {
        const current = workspaces.get(actor.businessProfileId);
        workspaces.set(actor.businessProfileId, {
          userId: actor.userId,
          businessProfileId: actor.businessProfileId,
          count: (current?.count ?? 0) + 1,
        });
      }
      await tx.notification.createMany({
        data: [...workspaces.values()].map((workspace) => ({
          userId: workspace.userId,
          businessProfileId: workspace.businessProfileId,
          type: "WEBSITE_LOGO_RECOMMENDATION",
          title: `A new ${website.name} logo is available`,
          body: `${workspace.count} Actor${workspace.count === 1 ? "" : "s"} can use the reviewed website logo. Review it before updating Apify.`,
          link: "/dashboard/actors?logoStatus=pending",
          dedupeKey: `website-logo:${logoId}:workspace:${workspace.businessProfileId}`,
        })),
        skipDuplicates: true,
      });
    }
  });
  return actors.length;
}

export const adminWebsiteLogoRoutes = new Hono<AppEnv>()
  .use("*", requireAdmin())
  .get("/", async (c) => {
    const page = Math.max(Number(c.req.query("page") ?? 1) || 1, 1);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
    const q = c.req.query("q")?.trim();
    const logoStatus = c.req.query("logoStatus");
    const requestedStatus = c.req.query("status");
    const status = ["ACTIVE", "LOGO_FAILED", "ARCHIVED"].includes(requestedStatus ?? "")
      ? requestedStatus
      : undefined;
    const confidence = c.req.query("confidence");
    const actorCount = c.req.query("actorCount");
    const confidenceRange =
      confidence === "high"
        ? { websiteConfidence: { gte: 0.85 } }
        : confidence === "medium"
          ? { websiteConfidence: { gte: 0.6, lt: 0.85 } }
          : confidence === "low"
            ? { websiteConfidence: { lt: 0.6 } }
            : {};
    const and: Prisma.WebsiteIdentityWhereInput[] = [];
    if (actorCount === "with") {
      and.push({ OR: [{ storeActors: { some: {} } }, { actors: { some: {} } }] });
    } else if (actorCount === "without") {
      and.push({ storeActors: { none: {} }, actors: { none: {} } });
    }
    if (confidence === "high" || confidence === "medium" || confidence === "low") {
      and.push({
        OR: [
          { storeActors: { some: confidenceRange as Prisma.StoreActorWhereInput } },
          { actors: { some: confidenceRange as Prisma.ActorWhereInput } },
        ],
      });
    }
    const where: Prisma.WebsiteIdentityWhereInput = {
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { slug: { contains: q } },
              { canonicalDomain: { contains: q } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(logoStatus === "missing"
        ? { currentLogoId: null }
        : logoStatus === "ready"
          ? { currentLogoId: { not: null } }
          : {}),
      ...(and.length ? { AND: and } : {}),
    };
    const [items, total, classified, unclassified, missingLogo, pendingReview, failed, runs] =
      await Promise.all([
        db.websiteIdentity.findMany({
          where,
          orderBy: [{ storeActors: { _count: "desc" } }, { name: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
          include: {
            currentLogo: true,
            logos: { orderBy: { createdAt: "desc" }, take: 10 },
            _count: { select: { storeActors: true, actors: true, logos: true } },
          },
        }),
        db.websiteIdentity.count({ where }),
        db.storeActor.count({ where: { websiteIdentityId: { not: null } } }),
        db.storeActor.count({ where: { websiteIdentityId: null } }),
        db.websiteIdentity.count({ where: { currentLogoId: null, status: { not: "ARCHIVED" } } }),
        db.websiteLogo.count({ where: { reviewStatus: "PENDING" } }),
        db.websiteIdentity.count({ where: { status: "LOGO_FAILED" } }),
        db.storeCatalogSync.findMany({
          where: { operation: { in: ["WEBSITE_CLASSIFICATION", "WEBSITE_LOGO_ENRICHMENT"] } },
          orderBy: { startedAt: "desc" },
          take: 10,
        }),
      ]);
    return c.json({
      ok: true,
      data: {
        items: items.map((item) => ({
          ...item,
          currentLogo: item.currentLogo
            ? { ...item.currentLogo, assetUrl: assetUrl(item.currentLogo.id) }
            : null,
          logos: item.logos.map((logo) => ({ ...logo, assetUrl: assetUrl(logo.id) })),
        })),
        total,
        page,
        limit,
        counts: { classified, unclassified, missingLogo, pendingReview, failed },
        runs,
      },
    });
  })
  .patch("/:id", zValidator("json", updateBody), async (c) => {
    const body = c.req.valid("json");
    const retryDiscovery = body.status === "ACTIVE" || body.canonicalDomain !== undefined;
    const item = await db.websiteIdentity.update({
      where: { id: c.req.param("id") },
      data: {
        ...body,
        ...(body.aliases ? { aliases: body.aliases as Prisma.InputJsonValue } : {}),
        ...(retryDiscovery ? { logoAttempts: 0, logoNextAttemptAt: null } : {}),
      },
    });
    await auditAdmin(c, "website.updated", `website:${item.id}`, body);
    return c.json({ ok: true, data: item });
  })
  .post("/:id/import", zValidator("json", importBody), async (c) => {
    const website = await db.websiteIdentity.findUnique({ where: { id: c.req.param("id") } });
    if (!website) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const body = c.req.valid("json");
    const source = await downloadLogoSource(body.sourceUrl);
    const stored = await storeWebsiteLogo(website.id, source.bytes);
    const logo = await db.websiteLogo.upsert({
      where: {
        websiteIdentityId_checksum: { websiteIdentityId: website.id, checksum: stored.checksum },
      },
      create: {
        websiteIdentityId: website.id,
        ...stored,
        sourceUrl: source.finalUrl,
        sourceDomain: new URL(source.finalUrl).hostname.toLowerCase(),
        // An admin chose this URL; it was not discovered on the official site.
        sourceKind: "ADMIN_URL",
      },
      update: {},
    });
    await auditAdmin(c, "website.logo.imported", `website:${website.id}`, {
      logoId: logo.id,
      sourceUrl: source.finalUrl,
      activate: body.activate,
    });
    let affectedActors = 0;
    if (body.activate) {
      const admin = c.get("adminSession");
      affectedActors = await activateLogo(
        website.id,
        logo.id,
        admin.viaApiKey ? null : admin.adminId,
      );
    }
    return c.json({ ok: true, data: { ...logo, assetUrl: assetUrl(logo.id), affectedActors } });
  })
  .post("/:id/upload", async (c) => {
    const website = await db.websiteIdentity.findUnique({ where: { id: c.req.param("id") } });
    if (!website) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File))
      return c.json({ ok: false, error: { code: "file_required" } }, 400);
    if (file.size > 5 * 1024 * 1024)
      return c.json(
        { ok: false, error: { code: "payload_too_large", message: "Logo source exceeds 5 MiB" } },
        413,
      );
    const stored = await storeWebsiteLogo(website.id, Buffer.from(await file.arrayBuffer()));
    const logo = await db.websiteLogo.upsert({
      where: {
        websiteIdentityId_checksum: { websiteIdentityId: website.id, checksum: stored.checksum },
      },
      create: { websiteIdentityId: website.id, ...stored, sourceKind: "ADMIN_UPLOAD" },
      update: {},
    });
    await auditAdmin(c, "website.logo.uploaded", `website:${website.id}`, {
      logoId: logo.id,
      fileName: file.name,
    });
    return c.json({ ok: true, data: { ...logo, assetUrl: assetUrl(logo.id) } });
  })
  .post("/:id/logos/:logoId/activate", async (c) => {
    const admin = c.get("adminSession");
    const affectedActors = await activateLogo(
      c.req.param("id"),
      c.req.param("logoId"),
      admin.viaApiKey ? null : admin.adminId,
    );
    await auditAdmin(c, "website.logo.activated", `website:${c.req.param("id")}`, {
      logoId: c.req.param("logoId"),
      affectedActors,
    });
    return c.json({ ok: true, data: { affectedActors } });
  })
  // Reject a candidate so it no longer blocks discovery for this website and
  // can be cleaned out of storage later. The active logo cannot be rejected.
  .post(
    "/:id/logos/:logoId/reject",
    zValidator("json", z.object({ notes: z.string().trim().max(2_000).optional() }).optional()),
    async (c) => {
      const admin = c.get("adminSession");
      const websiteId = c.req.param("id");
      const logoId = c.req.param("logoId");
      const notes = c.req.valid("json")?.notes;
      const logo = await db.websiteLogo.findFirst({
        where: { id: logoId, websiteIdentityId: websiteId },
        include: { currentFor: { select: { id: true } } },
      });
      if (!logo) throw new AppError("not_found", "Logo candidate was not found", 404);
      if (logo.currentFor) {
        throw new AppError(
          "logo_active",
          "Activate a different logo before rejecting the active one.",
          409,
        );
      }
      const updated = await db.websiteLogo.update({
        where: { id: logo.id },
        data: {
          reviewStatus: "REJECTED",
          reviewedAt: new Date(),
          reviewedById: admin.viaApiKey ? null : admin.adminId,
          ...(notes ? { reviewNotes: notes } : {}),
        },
      });
      await reconcileActorLogoRecommendations({ websiteIdentityId: websiteId });
      await auditAdmin(c, "website.logo.rejected", `website:${websiteId}`, { logoId, notes });
      return c.json({ ok: true, data: { ...updated, assetUrl: assetUrl(updated.id) } });
    },
  )
  .post("/:id/assign", zValidator("json", assignBody), async (c) => {
    const websiteId = c.req.param("id");
    const { actorIds, workspaceActorIds } = c.req.valid("json");
    const storeActors = await db.storeActor.findMany({
      where: { id: { in: actorIds } },
      select: { apifyActorId: true },
    });
    const workspaceActors = await db.actor.findMany({
      where: { id: { in: workspaceActorIds } },
      select: { id: true, apifyActorId: true },
    });
    const apifyActorIds = [
      ...new Set([...storeActors, ...workspaceActors].map((actor) => actor.apifyActorId)),
    ];
    await db.$transaction([
      db.storeActor.updateMany({
        where: { id: { in: actorIds } },
        data: {
          websiteIdentityId: websiteId,
          websiteAdminOverride: true,
          websiteMethod: "admin",
          websiteConfidence: 1,
          websiteClassifiedAt: new Date(),
        },
      }),
      db.actor.updateMany({
        where: { OR: [{ id: { in: workspaceActorIds } }, { apifyActorId: { in: apifyActorIds } }] },
        data: {
          websiteIdentityId: websiteId,
          websiteAdminOverride: true,
          websiteMethod: "admin",
          websiteConfidence: 1,
          websiteClassifiedAt: new Date(),
        },
      }),
    ]);
    await reconcileActorLogoRecommendations({ websiteIdentityId: websiteId });
    await auditAdmin(c, "website.actors.assigned", `website:${websiteId}`, {
      actorIds,
      workspaceActorIds,
    });
    return c.json({ ok: true, data: { updated: actorIds.length + workspaceActorIds.length } });
  })
  .post(
    "/:id/merge",
    zValidator("json", z.object({ sourceWebsiteId: z.string().min(1) })),
    async (c) => {
      const targetId = c.req.param("id");
      const { sourceWebsiteId } = c.req.valid("json");
      if (sourceWebsiteId === targetId)
        return c.json({ ok: false, error: { code: "same_identity" } }, 400);
      await db.$transaction([
        db.storeActor.updateMany({
          where: { websiteIdentityId: sourceWebsiteId },
          data: { websiteIdentityId: targetId, websiteAdminOverride: true },
        }),
        db.actor.updateMany({
          where: { websiteIdentityId: sourceWebsiteId },
          data: { websiteIdentityId: targetId, websiteAdminOverride: true },
        }),
        db.websiteIdentity.update({ where: { id: sourceWebsiteId }, data: { status: "ARCHIVED" } }),
      ]);
      await reconcileActorLogoRecommendations({ websiteIdentityId: targetId });
      await auditAdmin(c, "website.merged", `website:${targetId}`, { sourceWebsiteId });
      return c.json({ ok: true });
    },
  )
  .post("/reclassify", zValidator("json", reclassifyBody), async (c) => {
    const { actorIds, workspaceActorIds } = c.req.valid("json");
    const [storeActors, workspaceActors] = await Promise.all([
      db.storeActor.findMany({
        where: { id: { in: actorIds } },
        select: { apifyActorId: true },
      }),
      db.actor.findMany({
        where: { id: { in: workspaceActorIds } },
        select: { apifyActorId: true },
      }),
    ]);
    const apifyActorIds = [
      ...new Set([...storeActors, ...workspaceActors].map((actor) => actor.apifyActorId)),
    ];
    const reset = {
      websiteIdentityId: null,
      websiteConfidence: null,
      websiteMethod: null,
      websiteEvidence: Prisma.DbNull,
      websiteClassifiedAt: null,
      websiteAdminOverride: false,
      websiteClassificationError: null,
    };
    await db.$transaction([
      db.storeActor.updateMany({
        where: { OR: [{ id: { in: actorIds } }, { apifyActorId: { in: apifyActorIds } }] },
        data: reset,
      }),
      db.actor.updateMany({
        where: {
          OR: [{ id: { in: workspaceActorIds } }, { apifyActorId: { in: apifyActorIds } }],
        },
        data: reset,
      }),
    ]);
    await reconcileActorLogoRecommendations({
      OR: [{ id: { in: workspaceActorIds } }, { apifyActorId: { in: apifyActorIds } }],
    });
    const jobId = await enqueue(
      "catalog",
      { catalog: "websites" },
      { jobId: `website-reclassification-${Date.now()}` },
    );
    await auditAdmin(c, "website.actors.reclassified", "websites", {
      actorIds,
      workspaceActorIds,
    });
    return c.json(
      {
        ok: true,
        data: { reset: actorIds.length + workspaceActorIds.length, jobId },
      },
      202,
    );
  })
  .get("/runs/:runId", async (c) => {
    const run = await db.storeCatalogSync.findFirst({
      where: {
        id: c.req.param("runId"),
        operation: { in: ["WEBSITE_CLASSIFICATION", "WEBSITE_LOGO_ENRICHMENT"] },
      },
    });
    if (!run) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    return c.json({ ok: true, data: run });
  })
  .post("/runs/classification", async (c) => {
    const jobId = await enqueue(
      "catalog",
      { catalog: "websites" },
      { jobId: `website-classification-${Date.now()}` },
    );
    return c.json({ ok: true, data: { jobId } }, 202);
  })
  .post("/runs/logos", async (c) => {
    const jobId = await enqueue(
      "catalog",
      { catalog: "logos" },
      { jobId: `website-logos-${Date.now()}` },
    );
    return c.json({ ok: true, data: { jobId } }, 202);
  });
