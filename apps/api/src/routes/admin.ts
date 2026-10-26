import {
  getGatewayContext,
  getPaymentSetting,
  paymentProfileFields,
  saveGatewaySettings,
  isPaymentMode,
  legacyGatewayMode,
} from "../lib/payment-gateway-settings.js";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, hardDeleteUser } from "@actorconsole/db";
import {
  createApifyClient,
  getUserApifyClient,
  normalizeConsoleCookies,
  normalizeConsoleUiToken,
} from "@actorconsole/apify";
import {
  getLogger,
  INTEGRATION_CATALOG,
  isValidPaymentGateway,
  maskSecret,
  replyTicketSchema,
  selectActiveApifyConsoleCredential,
  ticketPrioritySchema,
  ticketStatusSchema,
} from "@actorconsole/shared";
import { requireAdmin } from "../middleware/admin.js";
import { assertCanManageUserSuspension } from "../lib/admin-user-access.js";
import { adminUserWorkspaceRoutes } from "./admin-user-workspaces.js";
import {
  deleteIntegration,
  getIntegration,
  recordIntegrationTest,
  setIntegration,
} from "../lib/integrations.js";
import type { AppEnv } from "../app.js";
import { sendTicketReplyEmail } from "../lib/email.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import {
  booleanQuery,
  dateQuery,
  enumQuery,
  integerQuery,
  limitQuery,
  stringQuery,
} from "../lib/query.js";
import {
  cancelProviderSubscription,
  createProviderProduct,
  getRazorpayClient,
  importProviderProduct,
  gatewayBillingOptions,
  gatewayReadiness,
  testGatewayConnection,
} from "../lib/billing-providers.js";

import { changelogDate, changelogFields } from "../lib/changelog.js";

const log = getLogger("api:admin");
const integrationKeyParam = z.object({ key: z.string().min(1).max(100) });
const integrationValueBody = z
  .object({
    value: z.string().min(1).max(20_000),
    label: z.string().min(1).max(200).optional(),
    description: z.string().max(2_000).optional(),
  })
  .strict();

const planMarketingFeatureParam = z.object({
  plan: z.enum(["FREE", "PRO"]),
});

const planMarketingFeatureBody = z
  .object({
    features: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(500),
            enabled: z.boolean().default(true),
          })
          .strict(),
      )
      .max(25),
  })
  .strict()
  .superRefine((value, ctx) => {
    const labels = value.features.map((feature) => feature.label.toLocaleLowerCase());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["features"],
        message: "Feature labels must be unique.",
      });
    }
  });

const adminTicketUpdateBody = z.object({
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  assigneeId: z.string().nullable(),
});

/**
 * Admin panel API - protected by requireAdmin middleware.
 *
 * The admin app talks to this via the `x-admin-api-key` header so it doesn't
 * need to live behind the same Auth.js cookie domain. In production, set
 * `ADMIN_API_KEY` to a long random secret.
 */
export const adminRoutes = new Hono<AppEnv>()
  .use("*", requireAdmin())

  // ============ Support tickets ============
  .get("/support", async (c) => {
    const q = stringQuery(c.req.query("q"), "q", 120);
    const status = enumQuery(c.req.query("status"), "status", [
      "OPEN",
      "PENDING",
      "RESPONDED",
      "RESOLVED",
      "CLOSED",
    ] as const);
    const priority = enumQuery(c.req.query("priority"), "priority", [
      "LOW",
      "NORMAL",
      "HIGH",
      "URGENT",
    ] as const);
    const sort =
      enumQuery(c.req.query("sort"), "sort", [
        "updatedAt",
        "createdAt",
        "status",
        "priority",
      ] as const) ?? "updatedAt";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (q) {
      where.OR = [{ subject: { contains: q } }, { user: { email: { contains: q } } }];
    }
    const [items, total] = await Promise.all([
      db.ticket.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true, name: true } },
          assignedTo: { select: { id: true, email: true, name: true } },
          actor: { select: { id: true, title: true, actorName: true, apifyActorId: true } },
          _count: { select: { messages: true } },
        },
      }),
      db.ticket.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  .get("/support/:id", async (c) => {
    const ticket = await db.ticket.findUnique({
      where: { id: c.req.param("id") },
      include: {
        user: { select: { id: true, email: true, name: true } },
        assignedTo: { select: { id: true, email: true, name: true } },
        actor: { select: { id: true, title: true, actorName: true, apifyActorId: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    return c.json({ ok: true, data: ticket });
  })

  .patch("/support/:id", zValidator("json", adminTicketUpdateBody), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    if (body.assigneeId) {
      const assignee = await db.user.findUnique({
        where: { id: body.assigneeId },
        select: { role: true },
      });
      if (!assignee || (assignee.role !== "ADMIN" && assignee.role !== "SUPER_ADMIN")) {
        return c.json({ ok: false, error: { code: "not_an_admin" } }, 400);
      }
    }
    const before = await db.ticket.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const updated = await db.ticket.update({
      where: { id },
      data: {
        status: body.status,
        priority: body.priority,
        assignedToId: body.assigneeId,
        closedAt: body.status === "CLOSED" ? (before.closedAt ?? new Date()) : null,
      },
    });
    await recordAudit(c, "ticket.update", `ticket:${id}`, before, updated);
    return c.json({ ok: true, data: updated });
  })

  .post("/support/:id/messages", zValidator("json", replyTicketSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const admin = c.get("adminSession");
    const rate = await checkRateLimit(`admin:ticket-reply:${admin.adminId}`, {
      label: "Admin ticket reply",
      windowMs: 60 * 60 * 1000,
      max: 100,
    });
    if (!rate.allowed) {
      return c.json(
        {
          ok: false,
          error: { code: "rate_limited", message: "Too many replies. Try again later." },
        },
        429,
      );
    }

    const ticket = await db.ticket.findUnique({
      where: { id },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!ticket) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    if (ticket.status === "CLOSED") {
      return c.json(
        { ok: false, error: { code: "ticket_closed", message: "Ticket is closed" } },
        409,
      );
    }

    const [message] = await db.$transaction([
      db.ticketMessage.create({
        data: {
          ticketId: id,
          authorId: admin.viaApiKey ? null : admin.adminId,
          authorType: "ADMIN",
          body: body.body,
          attachments: (body.attachments ?? undefined) as any,
        },
      }),
      db.ticket.update({
        where: { id },
        data: { lastReplyAt: new Date(), status: "RESPONDED" },
      }),
    ]);
    const delivery = await sendTicketReplyEmail(ticket.user.email, {
      userName: ticket.user.name ?? undefined,
      ticketNumber: ticket.number,
      ticketSubject: ticket.subject,
      fromName: admin.email,
      replyBody: body.body,
    });
    if (ticket.businessProfileId) {
      void db.notification
        .create({
          data: {
            userId: ticket.userId,
            businessProfileId: ticket.businessProfileId,
            type: "support.reply",
            title: `Support replied to AL-${ticket.number}`,
            body: ticket.subject,
            link: `/dashboard/support/${ticket.id}`,
            dedupeKey: `support-reply:${ticket.id}:${message.id}`,
          },
        })
        .catch(() => undefined);
    }
    await recordAudit(c, "ticket.reply", `ticket:${id}`, null, {
      messageId: message.id,
      emailDelivered: delivery.ok,
    });
    return c.json({ ok: true, data: { message, emailDelivery: delivery } }, 201);
  })

  // ============ Dashboard metrics ============
  .get("/metrics/overview", async (c) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      userCount,
      usersLastMonth,
      workspaceCount,
      proCount,
      activeSubs,
      mrrRaw,
      actorCount,
      publishingScheduleCount,
      reviewCount,
      webhookCount24h,
      errorCount24h,
      newUsersMonth,
      recentSignups,
      planBreakdown,
      openTickets,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { lt: monthStart } } }),
      db.businessProfile.count(),
      db.businessProfile.count({ where: { plan: "PRO" } }),
      db.subscription.count({ where: { status: "active" } }),
      db.payment.aggregate({
        where: {
          status: "captured",
          capturedAt: { gte: monthStart },
          OR: [{ billingMode: "live" }, { billingMode: null }],
        },
        _sum: { amount: true },
        _count: true,
      }),
      db.actor.count(),
      db.bulkPublishSchedule.count(),
      db.review.count(),
      db.webhookDelivery.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      db.appError.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      db.user.count({ where: { createdAt: { gte: monthStart } } }),
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          businessProfiles: { select: { id: true, name: true, plan: true } },
        },
      }),
      db.businessProfile.groupBy({ by: ["plan"], _count: true }),
      db.ticket.count({ where: { status: { in: ["OPEN", "PENDING", "RESPONDED"] } } }),
    ]);

    // Growth %
    const growth =
      usersLastMonth === 0
        ? newUsersMonth > 0
          ? 100
          : 0
        : Math.round(((userCount - usersLastMonth) / usersLastMonth) * 100);

    return c.json({
      ok: true,
      data: {
        users: { total: userCount, newThisMonth: newUsersMonth, growthPct: growth },
        workspaces: { total: workspaceCount },
        plans: {
          free: workspaceCount - proCount,
          pro: proCount,
        },
        activeSubscriptions: activeSubs,
        mrr: {
          amount: Number(mrrRaw._sum.amount ?? 0),
          currency: "INR",
          paymentCount: mrrRaw._count,
        },
        platform: {
          actors: actorCount,
          publishingSchedules: publishingScheduleCount,
          reviews: reviewCount,
          openTickets,
        },
        health: {
          webhooks24h: webhookCount24h,
          errors24h: errorCount24h,
        },
        recentSignups,
        planBreakdown: planBreakdown.map((p: { plan: string; _count: number }) => ({
          plan: p.plan,
          count: p._count,
        })),
      },
    });
  })

  // ============ Captured revenue time series (legacy route name retained for compatibility) ============
  .get("/metrics/mrr", async (c) => {
    const days = integerQuery(c.req.query("days"), {
      name: "days",
      defaultValue: 30,
      max: 3650,
    });
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const payments = await db.payment.findMany({
      where: {
        capturedAt: { gte: since },
        status: "captured",
        OR: [{ billingMode: "live" }, { billingMode: null }],
      },
      select: { amount: true, capturedAt: true },
    });

    // bucket by day
    const buckets: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    for (const p of payments) {
      if (!p.capturedAt) continue;
      const key = p.capturedAt.toISOString().slice(0, 10);
      if (key in buckets) buckets[key] += Number(p.amount);
    }

    return c.json({
      ok: true,
      data: Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date, amount })),
    });
  })

  .get("/metrics/signups", async (c) => {
    const days = integerQuery(c.req.query("days"), {
      name: "days",
      defaultValue: 30,
      max: 3650,
    });
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const users = await db.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const buckets: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    for (const u of users) {
      const key = u.createdAt.toISOString().slice(0, 10);
      if (key in buckets) buckets[key] += 1;
    }
    return c.json({
      ok: true,
      data: Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    });
  })

  // ============ Users CRUD ============
  .get("/users", async (c) => {
    const search = stringQuery(c.req.query("search"), "search");
    const plan = enumQuery(c.req.query("plan"), "plan", ["FREE", "PRO"] as const);
    const role = enumQuery(c.req.query("role"), "role", ["USER", "ADMIN", "SUPER_ADMIN"] as const);
    const suspended = booleanQuery(c.req.query("suspended"), "suspended");
    const sort =
      enumQuery(c.req.query("sort"), "sort", [
        "createdAt",
        "updatedAt",
        "email",
        "name",
        "role",
      ] as const) ?? "createdAt";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 25, 100);

    const where: any = {};
    if (search) {
      where.OR = [
        { id: { contains: search } },
        { email: { contains: search } },
        { name: { contains: search } },
      ];
    }
    if (plan) where.businessProfiles = { some: { plan } };
    if (role) where.role = role;
    if (suspended !== undefined) where.suspendedAt = suspended ? { not: null } : null;

    const [items, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          emailVerified: true,
          name: true,
          image: true,
          role: true,
          createdAt: true,
          suspendedAt: true,
          businessProfiles: {
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            select: { id: true, name: true, plan: true, isDefault: true },
          },
          _count: {
            select: {
              actors: true,
              bulkPublishSchedules: true,
              subscriptions: true,
              businessProfiles: true,
            },
          },
        },
      }),
      db.user.count({ where }),
    ]);

    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  .route("/users", adminUserWorkspaceRoutes)

  .get("/users/:id", async (c) => {
    const id = c.req.param("id");
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        bio: true,
        role: true,
        emailVerified: true,
        suspendedAt: true,
        bannedReason: true,
        deletionRequestedAt: true,
        deletionScheduledFor: true,
        createdAt: true,
        updatedAt: true,
        accounts: { select: { provider: true, providerAccountId: true } },
        businessProfiles: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            isDefault: true,
            subscriptions: { orderBy: { updatedAt: "desc" }, take: 1 },
            _count: { select: { actors: true, bulkPublishSchedules: true, notifications: true } },
          },
        },
        subscriptions: true,
        payments: { orderBy: { createdAt: "desc" }, take: 20 },
        apifyTokens: { select: { id: true, apifyUserId: true, createdAt: true } },
        _count: {
          select: {
            actors: true,
            bulkPublishSchedules: true,
            subscriptions: true,
            apifyTokens: true,
            notifications: true,
            tickets: true,
          },
        },
      },
    });
    if (!user) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    return c.json({ ok: true, data: user });
  })

  .patch(
    "/users/:id",
    zValidator(
      "json",
      z
        .object({
          name: z.string().nullable().optional(),
          bio: z.string().nullable().optional(),
          role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
          suspendedAt: z.string().nullable().optional(),
          bannedReason: z.string().nullable().optional(),
        })
        .strict(),
    ),
    async (c) => {
      const id = c.req.param("id");
      const body = c.req.valid("json");
      const before = await db.user.findUnique({ where: { id } });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      const admin = c.get("adminSession" as any);
      if (body.suspendedAt !== undefined) {
        assertCanManageUserSuspension(admin.role, before.role);
      }
      if (body.role && body.role !== before.role && admin?.role !== "SUPER_ADMIN") {
        return c.json({ ok: false, error: { code: "super_admin_required" } }, 403);
      }
      if (admin?.adminId === id && ((body.role && body.role !== before.role) || body.suspendedAt)) {
        return c.json(
          {
            ok: false,
            error: { code: "self_lockout", message: "You cannot demote or suspend yourself." },
          },
          400,
        );
      }
      if (before.role === "SUPER_ADMIN" && body.role && body.role !== "SUPER_ADMIN") {
        const superAdminCount = await db.user.count({ where: { role: "SUPER_ADMIN" } });
        if (superAdminCount <= 1) {
          return c.json(
            {
              ok: false,
              error: {
                code: "last_super_admin",
                message: "At least one super administrator is required.",
              },
            },
            409,
          );
        }
      }

      const update = db.user.update({
        where: { id },
        data: {
          ...body,
          suspendedAt:
            body.suspendedAt === null
              ? null
              : body.suspendedAt
                ? new Date(body.suspendedAt)
                : undefined,
        },
      });

      const revokeSessions = Boolean(body.suspendedAt);
      const updated = revokeSessions
        ? (await db.$transaction([
            update,
            db.session.deleteMany({ where: { userId: id } }),
          ]))[0]
        : await update;

      await recordAudit(c, "user.update", `user:${id}`, before, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  .post("/users/:id/suspend", async (c) => {
    const id = c.req.param("id");
    const admin = c.get("adminSession" as any);
    const before = await db.user.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    if (admin?.adminId === id) {
      return c.json({ ok: false, error: { code: "self_lockout" } }, 400);
    }
    assertCanManageUserSuspension(admin.role, before.role);
    const suspendedAt = new Date();
    const [, updated] = await db.$transaction([
      db.session.deleteMany({ where: { userId: id } }),
      db.user.update({ where: { id }, data: { suspendedAt } }),
    ]);
    await recordAudit(c, "user.suspend", `user:${id}`, before, updated);
    return c.json({ ok: true, data: updated });
  })

  .post("/users/:id/reinstate", async (c) => {
    const id = c.req.param("id");
    const before = await db.user.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    assertCanManageUserSuspension(c.get("adminSession").role, before.role);
    const updated = await db.user.update({
      where: { id },
      data: { suspendedAt: null, bannedReason: null },
    });
    await recordAudit(c, "user.reinstate", `user:${id}`, before, updated);
    return c.json({ ok: true, data: updated });
  })

  .patch(
    "/business-profiles/:id/plan",
    zValidator(
      "json",
      z
        .object({
          plan: z.enum(["FREE", "PRO"]),
          days: z.number().int().min(1).max(3650).default(365),
        })
        .strict(),
    ),
    async (c) => {
      const id = c.req.param("id");
      const { plan, days } = c.req.valid("json");
      const before = await db.businessProfile.findUnique({
        where: { id },
        include: { subscriptions: { orderBy: { updatedAt: "desc" }, take: 1 } },
      });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      const currentSubscription = before.subscriptions[0];
      if (
        (currentSubscription?.providerSubscriptionId ||
          currentSubscription?.razorpaySubscriptionId) &&
        ["created", "authenticated", "active", "pending", "cancellation_pending"].includes(
          currentSubscription.status,
        )
      ) {
        return c.json(
          {
            ok: false,
            error: {
              code: "gateway_subscription_active",
              message: `Cancel the active ${currentSubscription.provider} subscription before assigning a different plan.`,
            },
          },
          409,
        );
      }

      if (plan === "FREE") {
        const [workspace] = await db.$transaction([
          db.businessProfile.update({ where: { id }, data: { plan: "FREE" } }),
          db.subscription.updateMany({
            where: { businessProfileId: id, provider: "manual" },
            data: { status: "expired", cancelAtPeriodEnd: true },
          }),
        ]);
        await recordAudit(c, "workspace.plan.assign", `business-profile:${id}`, before, {
          plan: "FREE",
        });
        return c.json({ ok: true, data: workspace });
      }

      const currentPeriodEnd = new Date(Date.now() + days * 86_400_000);
      const [workspace, subscription] = await db.$transaction([
        db.businessProfile.update({ where: { id }, data: { plan } }),
        db.subscription.upsert({
          where: { businessProfileId: id },
          create: {
            userId: before.userId,
            businessProfileId: id,
            provider: "manual",
            billingMode: null,
            source: "admin_grant",
            status: "active",
            currentPeriodEnd,
            notes: `${plan} manually assigned for ${days} days`,
          },
          update: {
            provider: "manual",
            billingMode: null,
            source: "admin_grant",
            status: "active",
            cancelAtPeriodEnd: true,
            currentPeriodEnd,
            notes: `${plan} manually assigned for ${days} days`,
          },
        }),
      ]);
      await recordAudit(c, "workspace.plan.assign", `business-profile:${id}`, before, {
        plan,
        currentPeriodEnd,
      });
      return c.json({ ok: true, data: { workspace, subscription } });
    },
  )

  .delete("/users/:id", async (c) => {
    const id = c.req.param("id");
    const before = await db.user.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const admin = c.get("adminSession" as any);
    if (admin?.role !== "SUPER_ADMIN") {
      return c.json({ ok: false, error: { code: "super_admin_required" } }, 403);
    }
    if (admin.adminId === id) {
      return c.json({ ok: false, error: { code: "self_delete" } }, 400);
    }
    if (stringQuery(c.req.query("confirm"), "confirm", 320) !== before.email) {
      return c.json(
        {
          ok: false,
          error: {
            code: "confirmation_required",
            message: "Confirm with the user's exact email address.",
          },
        },
        400,
      );
    }
    await recordAudit(
      c,
      "user.delete.requested",
      `user:${id}`,
      {
        id: before.id,
        role: before.role,
        plan: before.plan,
        createdAt: before.createdAt,
      },
      { deleted: true },
    );
    await hardDeleteUser(id);
    return c.json({ ok: true, data: { id } });
  })

  // ============ Subscriptions ============
  .get("/subscriptions", async (c) => {
    const search = stringQuery(c.req.query("search"), "search", 120);
    const status = stringQuery(c.req.query("status"), "status", 64);
    const provider = stringQuery(c.req.query("provider"), "provider", 64);
    const sort =
      enumQuery(c.req.query("sort"), "sort", [
        "createdAt",
        "updatedAt",
        "currentPeriodEnd",
        "status",
        "provider",
      ] as const) ?? "updatedAt";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 25, 100);

    const where: any = {};
    if (status) where.status = status;
    if (provider) where.provider = provider;
    if (search) {
      where.OR = [
        { providerSubscriptionId: { contains: search } },
        { razorpaySubscriptionId: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { name: { contains: search } } },
        { businessProfile: { name: { contains: search } } },
      ];
    }

    const [items, total] = await Promise.all([
      db.subscription.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          businessProfile: { select: { id: true, name: true, plan: true } },
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.subscription.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  .get("/subscriptions/:id", async (c) => {
    const id = c.req.param("id");
    const sub = await db.subscription.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        businessProfile: { select: { id: true, name: true, plan: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!sub) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    return c.json({ ok: true, data: sub });
  })

  .post(
    "/subscriptions/:id/cancel",
    zValidator("json", z.object({ reason: z.string().optional() })),
    async (c) => {
      const id = c.req.param("id");
      const { reason } = c.req.valid("json");
      const sub = await db.subscription.findUnique({ where: { id } });
      if (!sub) return c.json({ ok: false, error: { code: "not_found" } }, 404);

      const claimed = await db.subscription.updateMany({
        where: { id, status: sub.status },
        data: { status: "cancellation_pending" },
      });
      if (claimed.count !== 1) {
        return c.json({ ok: false, error: { code: "operation_in_progress" } }, 409);
      }

      let providerResult: { status: string; cancelAtPeriodEnd: boolean } | null = null;
      if (sub.provider !== "manual" && (sub.providerSubscriptionId || sub.razorpaySubscriptionId)) {
        try {
          providerResult = await cancelProviderSubscription(sub);
        } catch (error) {
          await db.subscription.update({ where: { id }, data: { status: sub.status } });
          return c.json(
            {
              ok: false,
              error: {
                code: "provider_error",
                message:
                  error instanceof Error
                    ? error.message
                    : `${sub.provider} did not accept the cancellation.`,
              },
            },
            502,
          );
        }
      }

      const updated = await db.subscription.update({
        where: { id },
        data: {
          status: providerResult?.status ?? "cancelled",
          cancelAtPeriodEnd: providerResult?.cancelAtPeriodEnd ?? true,
          notes: reason ?? null,
        },
      });
      await recordAudit(c, "subscription.cancel", `subscription:${id}`, sub, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  .post(
    "/subscriptions/:id/grant",
    zValidator("json", z.object({ plan: z.literal("PRO"), days: z.number().int().positive() })),
    async (c) => {
      const id = c.req.param("id");
      const { plan, days } = c.req.valid("json");
      const sub = await db.subscription.findUnique({ where: { id } });
      if (!sub) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      if (
        (sub.providerSubscriptionId || sub.razorpaySubscriptionId) &&
        ["created", "authenticated", "active", "pending", "cancellation_pending"].includes(
          sub.status,
        )
      ) {
        return c.json(
          {
            ok: false,
            error: {
              code: "gateway_subscription_active",
              message: `Cancel the ${sub.provider} subscription before replacing it with a manual plan.`,
            },
          },
          409,
        );
      }
      if (!sub.businessProfileId) {
        return c.json(
          {
            ok: false,
            error: {
              code: "subscription_unowned",
              message: "This subscription is not linked to an active workspace",
            },
          },
          409,
        );
      }

      const periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const [updated] = await db.$transaction([
        db.subscription.update({
          where: { id },
          data: {
            provider: "manual",
            billingMode: null,
            source: "admin_grant",
            status: "active",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: periodEnd,
            notes: `Manually granted by admin for ${days} days`,
          },
        }),
        db.businessProfile.update({ where: { id: sub.businessProfileId }, data: { plan } }),
      ]);
      await recordAudit(c, "subscription.grant", `subscription:${id}`, sub, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  // ============ Payments ============
  .get("/payments", async (c) => {
    const search = stringQuery(c.req.query("search"), "search", 120);
    const status = stringQuery(c.req.query("status"), "status", 64);
    const provider = stringQuery(c.req.query("provider"), "provider", 64);
    const currency = stringQuery(c.req.query("currency"), "currency", 12);
    const sort =
      enumQuery(c.req.query("sort"), "sort", [
        "createdAt",
        "capturedAt",
        "amount",
        "status",
        "provider",
        "currency",
      ] as const) ?? "createdAt";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const where: any = {};
    if (status) where.status = status;
    if (provider) where.provider = provider;
    if (currency) where.currency = currency.toUpperCase();
    if (search) {
      where.OR = [
        { providerOrderId: { contains: search } },
        { providerPaymentId: { contains: search } },
        { razorpayOrderId: { contains: search } },
        { razorpayPaymentId: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { name: { contains: search } } },
        { businessProfile: { name: { contains: search } } },
      ];
    }
    const [items, total, paymentGroups] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          businessProfile: { select: { id: true, name: true } },
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payment.count({ where }),
      db.payment.groupBy({
        by: ["status", "currency"],
        where: { AND: [where, { OR: [{ billingMode: "live" }, { billingMode: null }] }] },
        _sum: { amount: true, refundedAmount: true },
      }),
    ]);
    const capturedStatuses = new Set(["captured", "partially_refunded", "refunded"]);
    const totalCaptured = paymentGroups
      .filter((group) => capturedStatuses.has(group.status))
      .reduce((sum, group) => sum + Number(group._sum.amount ?? 0), 0);
    const totalRefunded = paymentGroups.reduce(
      (sum, group) => sum + Number(group._sum.refundedAmount ?? 0),
      0,
    );
    const byCurrency = Object.values(
      paymentGroups.reduce<
        Record<string, { currency: string; captured: number; refunded: number; net: number }>
      >((summary, group) => {
        const item = (summary[group.currency] ??= {
          currency: group.currency,
          captured: 0,
          refunded: 0,
          net: 0,
        });
        if (capturedStatuses.has(group.status)) item.captured += Number(group._sum.amount ?? 0);
        item.refunded += Number(group._sum.refundedAmount ?? 0);
        item.net = item.captured - item.refunded;
        return summary;
      }, {}),
    );
    return c.json({
      ok: true,
      data: {
        items,
        total,
        page,
        limit,
        summary: { totalCaptured, totalRefunded, net: totalCaptured - totalRefunded, byCurrency },
      },
    });
  })

  .post(
    "/payments/:id/refund",
    zValidator(
      "json",
      z.object({ amount: z.number().int().positive().optional(), reason: z.string().optional() }),
    ),
    async (c) => {
      const id = c.req.param("id");
      const { amount, reason } = c.req.valid("json");
      const payment = await db.payment.findUnique({ where: { id } });
      if (!payment || !payment.razorpayPaymentId) {
        return c.json({ ok: false, error: { code: "no_payment_id" } }, 400);
      }

      const paidPaise = Math.round(Number(payment.amount) * 100);
      const refundedPaise = Math.round(Number(payment.refundedAmount ?? 0) * 100);
      const remainingPaise = paidPaise - refundedPaise;
      if (remainingPaise <= 0) {
        return c.json({ ok: false, error: { code: "already_refunded" } }, 409);
      }
      if (amount !== undefined && amount > remainingPaise) {
        return c.json(
          {
            ok: false,
            error: {
              code: "refund_exceeds_payment",
              message: "Refund exceeds the remaining captured amount.",
            },
          },
          400,
        );
      }

      const mode = isPaymentMode(payment.billingMode)
        ? payment.billingMode
        : await legacyGatewayMode("razorpay");
      const rz = await getRazorpayClient(mode);
      if (!rz) return c.json({ ok: false, error: { code: "razorpay_not_configured" } }, 503);
      const claimed = await db.payment.updateMany({
        where: { id, status: payment.status, refundedAmount: payment.refundedAmount },
        data: { status: "refund_pending" },
      });
      if (claimed.count !== 1) {
        return c.json({ ok: false, error: { code: "operation_in_progress" } }, 409);
      }

      let refund;
      try {
        refund = await rz.payments.refund(payment.razorpayPaymentId, {
          amount,
          notes: { reason: reason ?? "admin_refund", ActorConsoleAdmin: "1" },
        });
      } catch (error) {
        await db.payment.update({ where: { id }, data: { status: payment.status } });
        throw error;
      }

      const refundedNowPaise = amount ?? remainingPaise;
      const totalRefundedPaise = refundedPaise + refundedNowPaise;

      const updated = await db.payment.update({
        where: { id },
        data: {
          status: totalRefundedPaise >= paidPaise ? "refunded" : "partially_refunded",
          refundedAmount: (totalRefundedPaise / 100) as unknown as any,
          notes: { refundId: refund.id, reason } as any,
        },
      });
      await recordAudit(c, "payment.refund", `payment:${id}`, payment, updated);
      return c.json({ ok: true, data: { refund, payment: updated } });
    },
  )

  // ============ Actors (cross-user) ============
  .get("/actors", async (c) => {
    const search = stringQuery(c.req.query("search"), "search");
    const visibility = enumQuery(c.req.query("visibility"), "visibility", [
      "PUBLIC",
      "PRIVATE",
      "UNKNOWN",
    ] as const);
    const deprecated = booleanQuery(c.req.query("deprecated"), "deprecated");
    const publishReady = booleanQuery(c.req.query("publishReady"), "publishReady");
    const sort = enumQuery(c.req.query("sort"), "sort", [
      "updatedAt",
      "createdAt",
      "actorName",
      "title",
    ] as const);
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const);
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 25, 100);
    const where: any = {};
    if (search) {
      where.OR = [
        { actorName: { contains: search } },
        { title: { contains: search } },
        { username: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { name: { contains: search } } },
      ];
    }
    if (visibility === "PUBLIC") where.storeIsPublic = true;
    if (visibility === "PRIVATE") where.storeIsPublic = false;
    if (visibility === "UNKNOWN") where.storeIsPublic = null;
    if (deprecated !== undefined) where.storeIsDeprecated = deprecated;
    if (publishReady !== undefined) where.publishReady = publishReady;
    const sortField = sort ?? "updatedAt";
    const sortOrder = order ?? "desc";
    const [items, total] = await Promise.all([
      db.actor.findMany({
        where,
        include: {
          user: { select: { email: true, name: true } },
          websiteIdentity: { include: { currentLogo: { select: { id: true } } } },
        },
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.actor.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  .get("/actors/:id", async (c) => {
    const id = c.req.param("id");
    const actor = await db.actor.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        businessProfile: { select: { id: true, name: true, plan: true } },
        snapshots: { orderBy: { capturedAt: "desc" }, take: 30 },
        copyVariants: { orderBy: { createdAt: "desc" }, take: 20 },
        pricingHistory: { orderBy: { changedAt: "desc" }, take: 20 },
        bulkPublishItems: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { schedule: { select: { id: true, name: true, enabled: true } } },
        },
        usageDaily: { orderBy: { date: "desc" }, take: 30 },
        websiteIdentity: { include: { currentLogo: { select: { id: true } } } },
        logoRecommendations: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!actor) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const websiteUrl = actor.websiteIdentity?.currentLogo?.id
      ? `/api/website-logo-assets/${actor.websiteIdentity.currentLogo.id}`
      : null;
    return c.json({
      ok: true,
      data: {
        ...actor,
        website: actor.websiteIdentity,
        effectivePictureUrl: actor.currentImageUrl ?? websiteUrl,
        pictureSource: actor.currentImageUrl ? "actor" : websiteUrl ? "website" : "fallback",
      },
    });
  })

  // ============ Webhooks delivery log ============
  .get("/webhooks/:id", async (c) => {
    const id = c.req.param("id");
    const item = await db.webhookDelivery.findUnique({ where: { id } });
    if (!item) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    return c.json({ ok: true, data: item });
  })

  .get("/webhooks", async (c) => {
    const search = stringQuery(c.req.query("search"), "search", 120);
    const source = stringQuery(c.req.query("source"), "source", 64);
    const status = stringQuery(c.req.query("status"), "status", 64);
    const sort =
      enumQuery(c.req.query("sort"), "sort", [
        "createdAt",
        "source",
        "eventType",
        "status",
        "responseMs",
      ] as const) ?? "createdAt";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const where: any = {};
    if (source) where.source = source;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { eventType: { contains: search } },
        { externalId: { contains: search } },
        { error: { contains: search } },
      ];
    }
    const [items, total] = await Promise.all([
      db.webhookDelivery.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.webhookDelivery.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  // ============ App errors ============
  .get("/errors/:id", async (c) => {
    const id = c.req.param("id");
    const item = await db.appError.findUnique({ where: { id } });
    if (!item) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    return c.json({ ok: true, data: item });
  })

  .get("/errors", async (c) => {
    const search = stringQuery(c.req.query("search"), "search", 120);
    const source = stringQuery(c.req.query("source"), "source", 64);
    const severity = enumQuery(c.req.query("severity"), "severity", [
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ] as const);
    const sort =
      enumQuery(c.req.query("sort"), "sort", [
        "createdAt",
        "source",
        "severity",
        "fingerprint",
      ] as const) ?? "createdAt";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const where: any = {};
    if (severity) where.severity = severity;
    if (source) where.source = source;
    if (search) {
      where.OR = [
        { message: { contains: search } },
        { fingerprint: { contains: search } },
        { stack: { contains: search } },
      ];
    }
    const [items, total] = await Promise.all([
      db.appError.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.appError.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  .post(
    "/errors/log",
    zValidator(
      "json",
      z.object({
        source: z.enum(["web", "api", "worker", "mcp"]),
        message: z.string().min(1),
        stack: z.string().optional(),
        context: z.record(z.string(), z.unknown()).optional(),
        severity: z.enum(["debug", "info", "warn", "error", "fatal"]).default("error"),
        fingerprint: z.string().optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const err = await db.appError.create({
        data: {
          source: body.source,
          message: body.message,
          stack: body.stack,
          context: body.context as any,
          severity: body.severity,
          fingerprint: body.fingerprint,
        },
      });
      return c.json({ ok: true, data: err }, 201);
    },
  )

  // ============ Integrations (CRUD for credentials) ============
  .get("/integrations", async (c) => {
    const stored = await db.integration.findMany();
    const storedByKey = Object.fromEntries(stored.map((s) => [s.key, s]));
    const activeConsoleCredential = selectActiveApifyConsoleCredential({
      uiConfigured: Boolean(storedByKey.apify_ui_token?.value),
      uiTestStatus: storedByKey.apify_ui_token?.testStatus,
      cookiesConfigured: Boolean(storedByKey.apify_cookies?.value),
      cookiesTestStatus: storedByKey.apify_cookies?.testStatus,
    });

    const items = INTEGRATION_CATALOG.filter((def) => def.category !== "payment").map((def) => {
      const row = storedByKey[def.key];
      const isActive =
        def.key === "apify_api_token"
          ? Boolean(row?.value)
          : def.key === "apify_ui_token" || def.key === "apify_cookies"
            ? activeConsoleCredential === def.key
            : undefined;
      return {
        ...def,
        isConfigured: !!row,
        ...(isActive === undefined ? {} : { isActive }),
        ...(def.key === "apify_ui_token" || def.key === "apify_cookies"
          ? { activeConsoleCredential }
          : {}),
        value: row?.value ? maskSecret("configured") : null,
        lastTestedAt: row?.lastTestedAt ?? null,
        testStatus: row?.testStatus ?? null,
        testMessage: row?.testMessage ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });

    return c.json({ ok: true, data: items });
  })

  .get("/integrations/:key", zValidator("param", integrationKeyParam), async (c) => {
    const { key } = c.req.valid("param");
    const def = INTEGRATION_CATALOG.find((d) => d.key === key);
    if (!def) return c.json({ ok: false, error: { code: "unknown_integration" } }, 404);
    if (def.category === "payment")
      return c.json(
        {
          ok: false,
          error: {
            code: "payment_settings_moved",
            message: "Manage payment settings in Admin → Payment gateways.",
          },
        },
        409,
      );

    const row = await db.integration.findUnique({ where: { key } });
    // Secret values are write-only. Returning decrypted credentials to the
    // browser turns any admin-page XSS into a full infrastructure compromise.
    const value = row?.value && !def.isSecret ? await getIntegration(key) : null;

    let isActive: boolean | undefined;
    let activeConsoleCredential: ReturnType<typeof selectActiveApifyConsoleCredential> | undefined;
    if (key === "apify_api_token") {
      isActive = Boolean(row?.value);
    } else if (key === "apify_ui_token" || key === "apify_cookies") {
      const apifyRows = await db.integration.findMany({
        where: { key: { in: ["apify_ui_token", "apify_cookies"] } },
        select: { key: true, value: true, testStatus: true },
      });
      const apifyByKey = Object.fromEntries(apifyRows.map((item) => [item.key, item]));
      activeConsoleCredential = selectActiveApifyConsoleCredential({
        uiConfigured: Boolean(apifyByKey.apify_ui_token?.value),
        uiTestStatus: apifyByKey.apify_ui_token?.testStatus,
        cookiesConfigured: Boolean(apifyByKey.apify_cookies?.value),
        cookiesTestStatus: apifyByKey.apify_cookies?.testStatus,
      });
      isActive = activeConsoleCredential === key;
    }

    return c.json({
      ok: true,
      data: {
        ...def,
        isConfigured: !!row,
        ...(isActive === undefined ? {} : { isActive }),
        ...(activeConsoleCredential === undefined ? {} : { activeConsoleCredential }),
        value,
        lastTestedAt: row?.lastTestedAt ?? null,
        testStatus: row?.testStatus ?? null,
        testMessage: row?.testMessage ?? null,
        updatedAt: row?.updatedAt ?? null,
      },
    });
  })

  .put(
    "/integrations/:key",
    zValidator("param", integrationKeyParam),
    zValidator("json", integrationValueBody),
    async (c) => {
      const { key } = c.req.valid("param");
      const body = c.req.valid("json");
      const def = INTEGRATION_CATALOG.find((d) => d.key === key);
      if (!def) return c.json({ ok: false, error: { code: "unknown_integration" } }, 404);
      if (def.category === "payment")
        return c.json(
          {
            ok: false,
            error: {
              code: "payment_settings_moved",
              message: "Manage payment settings in Admin → Payment gateways.",
            },
          },
          409,
        );

      let normalizedValue = body.value;
      try {
        if (key === "apify_ui_token") normalizedValue = normalizeConsoleUiToken(body.value);
        if (key === "apify_cookies") normalizedValue = normalizeConsoleCookies(body.value);
      } catch (error) {
        return c.json(
          {
            ok: false,
            error: {
              code: "invalid_apify_credential",
              message: error instanceof Error ? error.message : "Invalid Apify credential",
            },
          },
          400,
        );
      }

      if (def.pattern && !new RegExp(def.pattern).test(normalizedValue)) {
        return c.json(
          {
            ok: false,
            error: {
              code: "pattern_mismatch",
              message: `Value does not match expected pattern.`,
            },
          },
          400,
        );
      }

      const before = await db.integration.findUnique({ where: { key } });
      await setIntegration(key, normalizedValue, {
        label: body.label ?? def.label,
        description: body.description ?? def.description,
        category: def.category,
        isSecret: def.isSecret,
      });
      await recordAudit(
        c,
        "integration.update",
        `integration:${key}`,
        { key, isConfigured: Boolean(before?.value) },
        { key, isConfigured: true },
      );

      return c.json({ ok: true, data: { key, isConfigured: true } });
    },
  )

  .delete("/integrations/:key", zValidator("param", integrationKeyParam), async (c) => {
    const { key } = c.req.valid("param");
    const def = INTEGRATION_CATALOG.find((item) => item.key === key);
    if (!def) return c.json({ ok: false, error: { code: "unknown_integration" } }, 404);
    if (def.category === "payment")
      return c.json(
        {
          ok: false,
          error: {
            code: "payment_settings_moved",
            message: "Manage payment settings in Admin → Payment gateways.",
          },
        },
        409,
      );
    const before = await db.integration.findUnique({ where: { key } });
    await deleteIntegration(key);
    await recordAudit(
      c,
      "integration.delete",
      `integration:${key}`,
      { key, isConfigured: Boolean(before?.value) },
      { key, isConfigured: false },
    );
    return c.json({ ok: true, data: { key, isConfigured: false } });
  })

  .post("/integrations/:key/test", zValidator("param", integrationKeyParam), async (c) => {
    const { key } = c.req.valid("param");
    const def = INTEGRATION_CATALOG.find((d) => d.key === key);
    if (!def) return c.json({ ok: false, error: { code: "unknown_integration" } }, 404);
    if (def.category === "payment")
      return c.json(
        {
          ok: false,
          error: {
            code: "payment_settings_moved",
            message: "Manage payment settings in Admin → Payment gateways.",
          },
        },
        409,
      );

    const value = await getIntegration(key);
    if (!value) {
      await recordIntegrationTest(key, "error", "Not configured");
      return c.json({ ok: false, error: { code: "not_configured" } }, 400);
    }

    // Per-key test logic
    let status: "ok" | "error" = "ok";
    let message = "OK";
    try {
      switch (key) {
        case "razorpay_key_id": {
          const { default: Razorpay } = await import("razorpay");
          const secret = await getIntegration("razorpay_key_secret");
          if (!secret) throw new Error("razorpay_key_secret not set");
          const rz = new Razorpay({ key_id: value, key_secret: secret });
          const list = await rz.payments.all({ count: 1 });
          message = `Connected. ${list.items.length} recent payment(s).`;
          break;
        }
        case "stripe_secret_key": {
          message = await testGatewayConnection("stripe");
          break;
        }
        case "dodo_api_key": {
          message = await testGatewayConnection("dodo");
          break;
        }
        case "openai_api_key": {
          const response = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${value}` },
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}`);
          message = "OpenAI API authenticated successfully.";
          break;
        }
        case "gemini_api_key": {
          const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
            headers: { "x-goog-api-key": value },
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}`);
          message = "Gemini API authenticated successfully.";
          break;
        }
        case "resend_api_key": {
          const { Resend } = await import("resend");
          const resend = new Resend(value);
          const response = await resend.apiKeys.list();
          if (response.error) throw new Error(response.error.message);
          message = "Resend API authenticated successfully.";
          break;
        }
        case "smtp_host": {
          const [portValue, secureValue, username, password] = await Promise.all([
            getIntegration("smtp_port"),
            getIntegration("smtp_secure"),
            getIntegration("smtp_username"),
            getIntegration("smtp_password"),
          ]);
          const port = Number(portValue || "587");
          if (!Number.isInteger(port) || port < 1 || port > 65_535) {
            throw new Error("smtp_port must be between 1 and 65535");
          }
          if (Boolean(username) !== Boolean(password)) {
            throw new Error("Configure both smtp_username and smtp_password, or neither");
          }
          const nodemailer = (await import("nodemailer")).default;
          const transport = nodemailer.createTransport({
            host: value,
            port,
            secure: secureValue === "true",
            auth: username && password ? { user: username, pass: password } : undefined,
          });
          await transport.verify();
          transport.close();
          message = "SMTP connection authenticated successfully.";
          break;
        }
        case "apify_api_token": {
          const me = await createApifyClient({ token: value }).validateApiAuthentication();
          message = `Apify API authenticated as ${me.username || me.id}; Actor inventory access verified.`;
          break;
        }
        case "apify_ui_token": {
          await createApifyClient({ uiToken: value }).validateConsoleAuthentication({
            verifyOrganizations: true,
          });
          message = "Apify UI key authenticated; Console organization access verified.";
          break;
        }
        case "apify_cookies": {
          await createApifyClient({ cookies: value }).validateConsoleAuthentication({
            verifyOrganizations: true,
          });
          message = "Apify cookies authenticated; Console organization access verified.";
          break;
        }
        default:
          throw new Error("No live connection test is available for this integration.");
      }
    } catch (err) {
      status = "error";
      message = err instanceof Error ? err.message : String(err);
    }

    await recordIntegrationTest(key, status, message);
    if (status === "error") {
      return c.json({ ok: false, error: { code: "integration_test_failed", message } }, 502);
    }
    return c.json({ ok: true, data: { status, message } });
  })

  // ============ Feature Flags ============
  .get("/feature-flags", async (c) => {
    const flags = await db.featureFlag.findMany({ orderBy: { key: "asc" } });
    return c.json({ ok: true, data: flags });
  })

  .put(
    "/feature-flags/:key",
    zValidator(
      "json",
      z.object({
        enabled: z.boolean(),
        description: z.string().nullable().optional(),
        rolloutPct: z.number().int().min(0).max(100).optional(),
      }),
    ),
    async (c) => {
      const key = c.req.param("key");
      const body = c.req.valid("json");
      const before = await db.featureFlag.findUnique({ where: { key } });
      const flag = await db.featureFlag.upsert({
        where: { key },
        create: { key, ...body, description: body.description ?? null },
        update: body,
      });
      await recordAudit(c, "feature_flag.update", `flag:${key}`, before, flag);
      return c.json({ ok: true, data: flag });
    },
  )

  // ============ Plan marketing features ============
  .get("/plan-features", async (c) => {
    const items = await db.planMarketingFeature.findMany({
      orderBy: [{ plan: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return c.json({ ok: true, data: items });
  })

  .put(
    "/plan-features/:plan",
    zValidator("param", planMarketingFeatureParam),
    zValidator("json", planMarketingFeatureBody),
    async (c) => {
      const { plan } = c.req.valid("param");
      const body = c.req.valid("json");
      const before = await db.planMarketingFeature.findMany({
        where: { plan },
        orderBy: { sortOrder: "asc" },
      });

      await db.$transaction(async (tx) => {
        await tx.planMarketingFeatureConfig.upsert({
          where: { plan },
          create: { plan, managed: true },
          update: { managed: true },
        });
        await tx.planMarketingFeature.deleteMany({ where: { plan } });
        if (body.features.length > 0) {
          await tx.planMarketingFeature.createMany({
            data: body.features.map((feature, sortOrder) => ({
              plan,
              label: feature.label,
              enabled: feature.enabled,
              sortOrder,
            })),
          });
        }
      });

      const items = await db.planMarketingFeature.findMany({
        where: { plan },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      await recordAudit(c, "plan_marketing_features.update", `plan:${plan}`, before, items);
      return c.json({ ok: true, data: items });
    },
  )

  // ============ Audit log ============
  .get("/audit-log/:id", async (c) => {
    const id = c.req.param("id");
    const item = await db.auditLog.findUnique({
      where: { id },
      include: {
        admin: { select: { email: true, name: true } },
        actor: { select: { email: true, name: true } },
      },
    });
    if (!item) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    return c.json({ ok: true, data: item });
  })

  .get("/audit-log", async (c) => {
    const search = stringQuery(c.req.query("search"), "search", 120);
    const source = stringQuery(c.req.query("source"), "source", 64);
    const sort =
      enumQuery(c.req.query("sort"), "sort", ["createdAt", "action", "source"] as const) ??
      "createdAt";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const where: any = {};
    if (source) where.source = source;
    if (search) {
      where.OR = [
        { action: { contains: search } },
        { resource: { contains: search } },
        { admin: { email: { contains: search } } },
        { actor: { email: { contains: search } } },
      ];
    }
    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: {
          admin: { select: { email: true, name: true } },
          actor: { select: { email: true, name: true } },
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  // ============ Payment Gateways ============
  .get("/payment-gateways", async (c) => {
    const gateways = await db.paymentGateway.findMany({
      orderBy: { sortOrder: "asc" },
    });
    const data = await Promise.all(
      gateways.map(async (gateway) => {
        if (!isValidPaymentGateway(gateway.key)) {
          return {
            ...gateway,
            callbackUrl: null,
            readiness: {
              ready: false,
              configuredKeys: [],
              missingCredentials: [],
              missingProducts: [],
            },
          };
        }
        const context = await getGatewayContext(gateway.key);
        const profiles = await Promise.all(
          (["test", "live"] as const).map(async (mode) => {
            const profile = await getGatewayContext(context.gateway, mode);
            const [fields, readiness, billingOptions] = await Promise.all([
              paymentProfileFields(profile),
              gatewayReadiness(context.gateway, profile),
              gatewayBillingOptions(context.gateway, profile),
            ]);
            return { mode, fields, readiness, billingOptions };
          }),
        );
        const active = profiles.find((profile) => profile.mode === context.mode)!;
        return {
          ...gateway,
          config: undefined,
          mode: context.mode,
          profiles,
          callbackUrl: await getPaymentSetting(`${gateway.key}_callback_url`, context),
          readiness: active.readiness,
          billingOptions: active.billingOptions,
        };
      }),
    );
    return c.json({ ok: true, data });
  })

  .put(
    "/payment-gateways/:key/configuration",
    zValidator(
      "json",
      z
        .object({
          mode: z.enum(["test", "live"]),
          settings: z.record(z.string().max(200), z.string().max(20_000).nullable()),
        })
        .strict(),
    ),
    async (c) => {
      const key = c.req.param("key");
      if (!isValidPaymentGateway(key))
        return c.json({ ok: false, error: { code: "not_found" } }, 404);
      const { mode, settings } = c.req.valid("json");
      try {
        await saveGatewaySettings(key, mode, settings);
        // Audit field names only: credentials never enter the audit payload.
        await recordAudit(
          c,
          "payment_gateway.configuration",
          `payment_gateway:${key}:${mode}`,
          null,
          { mode, fields: Object.keys(settings) },
        );
        return c.json({ ok: true, data: { mode } });
      } catch (error) {
        return c.json(
          {
            ok: false,
            error: {
              code: "invalid_payment_settings",
              message: error instanceof Error ? error.message : "Could not save payment settings.",
            },
          },
          400,
        );
      }
    },
  )
  .put(
    "/payment-gateways/:key/mode",
    zValidator("json", z.object({ mode: z.enum(["test", "live"]) }).strict()),
    async (c) => {
      const key = c.req.param("key");
      if (!isValidPaymentGateway(key))
        return c.json({ ok: false, error: { code: "not_found" } }, 404);
      const { mode } = c.req.valid("json");
      const before = await db.paymentGateway.findUnique({ where: { key } });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      if (before.enabled && !(await gatewayReadiness(key, mode)).ready)
        return c.json(
          {
            ok: false,
            error: {
              code: "gateway_not_configured",
              message: `Configure ${mode} credentials and a Pro product before activating this mode.`,
            },
          },
          409,
        );
      await saveGatewaySettings(key, mode, {});
      const migrated = await db.paymentGateway.findUnique({ where: { key } });
      await db.paymentGateway.update({
        where: { key },
        data: { config: { ...((migrated?.config ?? {}) as Record<string, any>), mode } },
      });
      await recordAudit(c, "payment_gateway.mode", `payment_gateway:${key}`, null, { mode });
      return c.json({ ok: true, data: { mode } });
    },
  )

  .put(
    "/payment-gateways/:key",
    zValidator(
      "json",
      z
        .object({
          enabled: z.boolean(),
          name: z.string().optional(),
          sortOrder: z.number().int().optional(),
        })
        .strict(),
    ),
    async (c) => {
      const key = c.req.param("key");
      const body = c.req.valid("json");

      if (!isValidPaymentGateway(key)) {
        return c.json(
          { ok: false, error: { code: "not_found", message: "Payment gateway not found." } },
          404,
        );
      }

      const before = await db.paymentGateway.findUnique({ where: { key } });
      if (!before) {
        return c.json(
          { ok: false, error: { code: "not_found", message: `Gateway "${key}" not found.` } },
          404,
        );
      }
      if (body.enabled) {
        const readiness = await gatewayReadiness(key);
        if (!readiness.ready) {
          return c.json(
            {
              ok: false,
              error: {
                code: "gateway_not_configured",
                message:
                  "Configure the required credentials and Pro product before enabling this gateway.",
              },
            },
            409,
          );
        }
      }
      const updated = await db.paymentGateway.update({
        where: { key },
        data: {
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        },
      });

      await recordAudit(c, "payment_gateway.update", `payment_gateway:${key}`, before, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  .post(
    "/payment-gateways/:key/test",
    zValidator("json", z.object({ mode: z.enum(["test", "live"]).optional() }).strict()),
    async (c) => {
      const key = c.req.param("key");
      if (!isValidPaymentGateway(key))
        return c.json({ ok: false, error: { code: "not_found" } }, 404);
      const context = await getGatewayContext(key, c.req.valid("json").mode);
      const primaryKey =
        key === "stripe"
          ? "stripe_secret_key"
          : key === "dodo"
            ? "dodo_api_key"
            : "razorpay_key_id";
      const scopedKey = primaryKey.replace(`${key}_`, `${key}_${context.mode}_`);
      try {
        const message = await testGatewayConnection(key, context.mode);
        await recordIntegrationTest(scopedKey, "ok", message);
        return c.json({ ok: true, data: { status: "ok", message, mode: context.mode } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordIntegrationTest(scopedKey, "error", message);
        return c.json({ ok: false, error: { code: "gateway_test_failed", message } }, 502);
      }
    },
  )

  .post(
    "/payment-gateways/:key/products/import",
    zValidator(
      "json",
      z
        .object({
          productId: z
            .string()
            .trim()
            .min(4)
            .max(200)
            .regex(/^[A-Za-z0-9_-]+$/),
          interval: z.enum(["month", "year"]),
          mode: z.enum(["test", "live"]).optional(),
        })
        .strict(),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const key = c.req.param("key");
      if (!isValidPaymentGateway(key))
        return c.json({ ok: false, error: { code: "not_found" } }, 404);
      try {
        const product = await importProviderProduct(key, body.productId, body.interval, body.mode);
        await recordAudit(
          c,
          "payment_gateway.product_import",
          `payment_gateway:${key}:PRO:${body.interval}`,
          null,
          product,
        );
        return c.json({ ok: true, data: product });
      } catch (error) {
        return c.json(
          {
            ok: false,
            error: {
              code: "product_import_failed",
              message: error instanceof Error ? error.message : "Product verification failed.",
            },
          },
          502,
        );
      }
    },
  )

  .post(
    "/payment-gateways/:key/products",
    zValidator(
      "json",
      z
        .object({
          plan: z.literal("PRO").default("PRO"),
          name: z.string().trim().min(1).max(200),
          description: z.string().trim().max(2_000).optional(),
          amountMinor: z.number().int().positive().max(100_000_000),
          currency: z
            .string()
            .trim()
            .length(3)
            .transform((value) => value.toUpperCase()),
          interval: z.enum(["month", "year"]),
          mode: z.enum(["test", "live"]).optional(),
        })
        .strict(),
    ),
    async (c) => {
      const key = c.req.param("key");
      if (!isValidPaymentGateway(key)) {
        return c.json({ ok: false, error: { code: "not_found" } }, 404);
      }
      const body = c.req.valid("json");
      try {
        const product = await createProviderProduct(key, body, body.mode);
        await recordAudit(
          c,
          "payment_gateway.product_create",
          `payment_gateway:${key}:${body.plan}`,
          null,
          product,
        );
        return c.json({ ok: true, data: product }, 201);
      } catch (error) {
        return c.json(
          {
            ok: false,
            error: {
              code: "provider_error",
              message: error instanceof Error ? error.message : "Product creation failed.",
            },
          },
          502,
        );
      }
    },
  )

  // ============ Temporary user impersonation ============
  .post("/users/:id/impersonate", async (c) => {
    const admin = c.get("adminSession" as any);
    if (admin?.viaApiKey || !["ADMIN", "SUPER_ADMIN"].includes(admin?.role)) {
      return c.json({ ok: false, error: { code: "admin_session_required" } }, 403);
    }
    const targetUserId = c.req.param("id");
    if (admin.adminId === targetUserId) {
      return c.json({ ok: false, error: { code: "self_impersonation" } }, 400);
    }
    const target = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true, suspendedAt: true, deletionScheduledFor: true },
    });
    if (!target) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    if (target.role !== "USER" || target.suspendedAt || target.deletionScheduledFor) {
      return c.json({ ok: false, error: { code: "impersonation_not_allowed" } }, 409);
    }
    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.impersonationSession.create({
      data: {
        adminId: admin.adminId,
        targetUserId,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        expiresAt,
      },
    });
    await recordAudit(c, "user.impersonation.started", `user:${targetUserId}`, null, {
      targetUserId,
      expiresAt,
    });
    return c.json({ ok: true, data: { token: rawToken, expiresAt } });
  })

  .post(
    "/impersonation/consume",
    zValidator("json", z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) })),
    async (c) => {
      const admin = c.get("adminSession" as any);
      if (admin?.viaApiKey || !["ADMIN", "SUPER_ADMIN"].includes(admin?.role)) {
        return c.json({ ok: false, error: { code: "admin_session_required" } }, 403);
      }
      const { token } = c.req.valid("json");
      const impersonation = await db.impersonationSession.findUnique({
        where: { tokenHash: createHash("sha256").update(token).digest("hex") },
        include: {
          target: {
            select: {
              id: true,
              email: true,
              role: true,
              suspendedAt: true,
              deletionScheduledFor: true,
            },
          },
        },
      });
      if (
        !impersonation ||
        impersonation.revokedAt ||
        impersonation.expiresAt <= new Date() ||
        impersonation.adminId !== admin.adminId ||
        impersonation.target.role !== "USER" ||
        impersonation.target.suspendedAt ||
        impersonation.target.deletionScheduledFor
      ) {
        return c.json({ ok: false, error: { code: "impersonation_invalid" } }, 401);
      }
      const sessionToken = randomBytes(32).toString("hex");
      const session = await db.$transaction(async (tx) => {
        const claim = await tx.impersonationSession.updateMany({
          where: { id: impersonation.id, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { revokedAt: new Date() },
        });
        if (claim.count !== 1) return null;
        const created = await tx.session.create({
          data: {
            sessionToken,
            userId: impersonation.targetUserId,
            expires: impersonation.expiresAt,
            impersonatedById: impersonation.adminId,
            impersonationExpiresAt: impersonation.expiresAt,
          },
        });
        await tx.impersonationSession.update({
          where: { id: impersonation.id },
          data: { sessionId: created.id },
        });
        return created;
      });
      if (!session) return c.json({ ok: false, error: { code: "impersonation_invalid" } }, 401);
      await recordAudit(
        c,
        "user.impersonation.consumed",
        `user:${impersonation.targetUserId}`,
        null,
        {
          sessionId: session.id,
          expiresAt: impersonation.expiresAt,
        },
      );
      return c.json({ ok: true, data: { sessionToken, expiresAt: impersonation.expiresAt } });
    },
  );

// ===== Helper =====
/**
 * Persist an audit-trail row for any admin action.
 *
 * - Real admin user: `adminId` is set, `source = "ui"`.
 * - Service-to-service (x-admin-api-key): `adminId = null`, `source = "api-key"`.
 *
 * The audit log is no longer blind to service-to-service actions. Filter by
 * `source` in the admin UI to separate human vs. automated changes.
 */
export async function recordAudit(
  c: any,
  action: string,
  resource: string | null,
  before: unknown,
  after: unknown,
) {
  const admin = c.get("adminSession" as any);
  const isApiKey = admin?.viaApiKey === true;
  // Skip only when there is no session at all; requireAdmin normally prevents this.
  if (!admin) return;

  await db.auditLog.create({
    data: {
      adminId: isApiKey ? null : admin.adminId,
      action,
      resource,
      before: redactAuditValue(before) as any,
      after: redactAuditValue(after) as any,
      ip: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      source: isApiKey ? "api-key" : "ui",
    },
  });
}

const SENSITIVE_AUDIT_KEY =
  /password|secret|encrypted|recovery.?codes|access_?token|refresh_?token|id_?token|session_?token|key_?hash|token_?hash|webhook_?url/i;

/** Remove credentials from snapshots before they become durable audit data. */
export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_AUDIT_KEY.test(key) ? "[REDACTED]" : redactAuditValue(nested),
    ]),
  );
}

// =====================================================
// Admin: Policies
// =====================================================
const policyDraftBody = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(1).max(200_000),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});

const policySlugParam = z.object({
  slug: z.enum(["TERMS", "PRIVACY", "COOKIES", "REFUND", "AUP", "DPA"]),
});
const policyVersionParam = z.object({
  slug: z.enum(["TERMS", "PRIVACY", "COOKIES", "REFUND", "AUP", "DPA"]),
  version: z.string().min(1).max(50),
});

adminRoutes
  .get("/policies", async (c) => {
    const items = await db.policy.findMany({
      orderBy: [{ slug: "asc" }, { version: "desc" }],
      include: {/* no createdBy relation since we removed it; could add later */},
    });
    return c.json({ ok: true, data: items });
  })

  .get("/policies/:slug", zValidator("param", policySlugParam), async (c) => {
    const { slug } = c.req.valid("param");
    const items = await db.policy.findMany({
      where: { slug: slug as any },
      orderBy: { version: "desc" },
    });
    return c.json({ ok: true, data: items });
  })

  .post(
    "/policies/:slug/drafts",
    zValidator("param", policySlugParam),
    zValidator("json", policyDraftBody),
    async (c) => {
      const { slug } = c.req.valid("param");
      const body = c.req.valid("json");
      const existing = await db.policy.findUnique({
        where: { slug_version: { slug: slug as any, version: body.version } },
      });
      if (existing) {
        return c.json({ ok: false, error: { code: "version_exists" } }, 409);
      }
      const created = await db.policy.create({
        data: {
          slug: slug as any,
          version: body.version,
          title: body.title,
          body: body.body,
          status: "DRAFT",
        },
      });
      await recordAudit(c, "policy.draft", `policy:${slug}@${body.version}`, null, created);
      return c.json({ ok: true, data: created }, 201);
    },
  )

  .put(
    "/policies/:slug/versions/:version",
    zValidator("param", policyVersionParam),
    zValidator("json", policyDraftBody.partial()),
    async (c) => {
      const { slug, version } = c.req.valid("param");
      const body = c.req.valid("json");
      const before = await db.policy.findUnique({
        where: { slug_version: { slug: slug as any, version } },
      });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      if (before.status !== "DRAFT" || before.deletedAt) {
        return c.json({ ok: false, error: { code: "not_editable" } }, 409);
      }
      const updated = await db.policy.update({
        where: { slug_version: { slug: slug as any, version } },
        data: body,
      });
      await recordAudit(c, "policy.update", `policy:${slug}@${version}`, before, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  .post(
    "/policies/:slug/versions/:version/publish",
    zValidator("param", policyVersionParam),
    async (c) => {
      const { slug, version } = c.req.valid("param");
      const before = await db.policy.findUnique({
        where: { slug_version: { slug: slug as any, version } },
      });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      if (before.status === "PUBLISHED" || before.deletedAt) {
        return c.json({ ok: false, error: { code: "already_published" } }, 409);
      }
      const updated = await db.policy.update({
        where: { slug_version: { slug: slug as any, version } },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      await recordAudit(c, "policy.publish", `policy:${slug}@${version}`, before, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  .delete(
    "/policies/:slug/versions/:version",
    zValidator("param", policyVersionParam),
    async (c) => {
      const { slug, version } = c.req.valid("param");
      const before = await db.policy.findUnique({
        where: { slug_version: { slug: slug as any, version } },
      });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      if (before.status === "PUBLISHED" || before.deletedAt) {
        return c.json({ ok: false, error: { code: "cannot_delete_published" } }, 409);
      }
      const archived = await db.policy.update({
        where: { slug_version: { slug: slug as any, version } },
        data: { status: "ARCHIVED", deletedAt: new Date() },
      });
      await recordAudit(c, "policy.delete_draft", `policy:${slug}@${version}`, before, archived);
      return c.json({ ok: true, data: { id: before.id } });
    },
  )

  // =====================================================
  // Admin: Apify usage costs
  // =====================================================
  .get("/usage-costs", async (c) => {
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const actorId = stringQuery(c.req.query("actorId"), "actorId", 200);
    const search = stringQuery(c.req.query("search"), "search", 200);
    const from = dateQuery(c.req.query("from"), "from");
    const to = dateQuery(c.req.query("to"), "to");
    const sort =
      enumQuery(c.req.query("sort"), "sort", [
        "date",
        "usageCostUsd",
        "runs",
        "adjustmentUsd",
        "actorId",
      ] as const) ?? "date";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";

    const where: any = {};
    if (actorId) where.actorId = actorId;
    if (search) {
      where.actor = {
        OR: [{ actorName: { contains: search } }, { apifyActorId: { contains: search } }],
      };
    }
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }

    const [items, total] = await Promise.all([
      db.usageDaily.findMany({
        where,
        orderBy: [{ [sort]: order }, { actorId: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { actorName: true, apifyActorId: true } } },
      }),
      db.usageDaily.count({ where }),
    ]);

    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  .get("/usage-costs/summary", async (c) => {
    const actorId = stringQuery(c.req.query("actorId"), "actorId", 200);
    const search = stringQuery(c.req.query("search"), "search", 200);
    const from = dateQuery(c.req.query("from"), "from");
    const to = dateQuery(c.req.query("to"), "to");
    const where: any = {};
    if (actorId) where.actorId = actorId;
    if (search) {
      where.actor = {
        OR: [{ actorName: { contains: search } }, { apifyActorId: { contains: search } }],
      };
    }
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    const [agg, dates] = await Promise.all([
      db.usageDaily.aggregate({
        where,
        _sum: { usageCostUsd: true, runs: true },
        _avg: { usageCostUsd: true },
      }),
      db.usageDaily.groupBy({ by: ["date"], where }),
    ]);
    return c.json({
      ok: true,
      data: {
        totalUsageCostUsd: agg._sum.usageCostUsd ?? 0,
        totalRuns: agg._sum.runs ?? 0,
        avgDailyUsageCostUsd: agg._avg.usageCostUsd ?? 0,
        daysWithData: dates.length,
      },
    });
  })

  .post("/usage-costs/sync", async (c) => {
    const result = await syncUsageCostsForConnectedUsers();
    return c.json({ ok: true, data: result });
  });

async function syncUsageCostsForConnectedUsers() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = thirtyDaysAgo.toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  let upserted = 0;
  const connectedUsers = await db.apifyToken.findMany({
    select: { userId: true, businessProfileId: true },
  });
  for (const { userId, businessProfileId } of connectedUsers) {
    const apify = await getUserApifyClient(userId, businessProfileId);
    if (!apify) continue;
    const [items, actors] = await Promise.all([
      apify.getBillingDailyUsage(from, to),
      db.actor.findMany({
        where: { userId, businessProfileId },
        select: { id: true, apifyActorId: true },
      }),
    ]);
    const actorByApifyId = new Map(
      actors.map((a: { id: string; apifyActorId: string }) => [a.apifyActorId, a.id]),
    );
    for (const item of items) {
      const dbActorId = actorByApifyId.get(item.actorId);
      if (!dbActorId) continue;
      const date = new Date(item.date + "T00:00:00.000Z");
      await db.usageDaily.upsert({
        where: { actorId_date: { actorId: dbActorId, date } },
        create: { actorId: dbActorId, date, usageCostUsd: String(item.amountUsd), runs: item.runs },
        update: { usageCostUsd: String(item.amountUsd), runs: item.runs },
      });
      upserted++;
    }
  }
  log.info({ upserted, users: connectedUsers.length }, "Admin usage-cost sync completed");
  return { upserted, users: connectedUsers.length };
}

adminRoutes
  // =====================================================
  // Admin: Announcements
  // =====================================================
  .get("/announcements", async (c) => {
    const items = await db.announcement.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { dismissals: true } } },
    });
    return c.json({ ok: true, data: items });
  })

  .post(
    "/announcements",
    zValidator(
      "json",
      z.object({
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
        emoji: z.string().optional(),
        linkUrl: z
          .string()
          .max(2000)
          .refine(
            (value) => value.startsWith("/") || /^https?:\/\//i.test(value),
            "Use a relative or HTTP(S) URL",
          )
          .optional(),
        linkLabel: z.string().max(100).optional(),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
      const endsAt = body.endsAt ? new Date(body.endsAt) : null;
      if (endsAt && endsAt <= startsAt) {
        return c.json(
          {
            ok: false,
            error: { code: "invalid_window", message: "End time must be after start time." },
          },
          400,
        );
      }
      const announcement = await db.announcement.create({
        data: {
          ...body,
          startsAt,
          endsAt,
        },
      });
      await recordAudit(
        c,
        "announcement.create",
        `announcement:${announcement.id}`,
        null,
        announcement,
      );
      return c.json({ ok: true, data: announcement }, 201);
    },
  )

  .patch(
    "/announcements/:id",
    zValidator(
      "json",
      z.object({
        title: z.string().min(1).max(200).optional(),
        body: z.string().min(1).max(5000).optional(),
        emoji: z.string().max(16).nullable().optional(),
        linkUrl: z
          .string()
          .max(2000)
          .refine(
            (value) => value.startsWith("/") || /^https?:\/\//i.test(value),
            "Use a relative or HTTP(S) URL",
          )
          .nullable()
          .optional(),
        linkLabel: z.string().max(100).nullable().optional(),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().nullable().optional(),
      }),
    ),
    async (c) => {
      const id = c.req.param("id");
      const body = c.req.valid("json");
      const before = await db.announcement.findUnique({ where: { id } });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      const startsAt = body.startsAt ? new Date(body.startsAt) : before.startsAt;
      const endsAt =
        body.endsAt === null ? null : body.endsAt ? new Date(body.endsAt) : before.endsAt;
      if (endsAt && endsAt <= startsAt) {
        return c.json(
          {
            ok: false,
            error: { code: "invalid_window", message: "End time must be after start time." },
          },
          400,
        );
      }
      const updated = await db.announcement.update({
        where: { id },
        data: { ...body, startsAt, endsAt },
      });
      await recordAudit(c, "announcement.update", `announcement:${id}`, before, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  .delete("/announcements/:id", async (c) => {
    const id = c.req.param("id");
    const before = await db.announcement.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    await db.announcement.delete({ where: { id } });
    await recordAudit(c, "announcement.delete", `announcement:${id}`, before, null);
    return c.json({ ok: true, data: { id } });
  })

  // =====================================================
  // Admin: Changelog Entries
  // =====================================================

  .get("/changelog/entries", async (c) => {
    const search = stringQuery(c.req.query("search"), "search");
    const version = stringQuery(c.req.query("version"), "version", 64);
    const isPublished = booleanQuery(c.req.query("isPublished"), "isPublished");
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 100);

    const where: any = {};
    if (search) {
      where.OR = [
        { text: { contains: search } },
        { title: { contains: search } },
        { version: { contains: search } },
      ];
    }
    if (version) where.version = version;
    if (isPublished !== undefined) where.isPublished = isPublished;

    const [items, total] = await Promise.all([
      db.changelogEntry.findMany({
        where,
        include: { tags: { orderBy: { tag: "asc" } } },
        orderBy: [{ releaseDate: "desc" }, { version: "desc" }, { sortOrder: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.changelogEntry.count({ where }),
    ]);

    return c.json({
      ok: true,
      data: {
        items: items.map((item) => ({ ...item, tags: item.tags.map(({ tag }) => tag) })),
        total,
        page,
        limit,
      },
    });
  })

  .get("/changelog/versions", async (c) => {
    const versions = await db.changelogEntry.groupBy({
      by: ["version"],
      _count: { id: true },
      _min: { releaseDate: true },
      orderBy: { _min: { releaseDate: "desc" } },
    });

    // Also get published counts per version
    const publishedCounts = await db.changelogEntry.groupBy({
      by: ["version"],
      _count: { id: true },
      where: { isPublished: true },
    });
    const publishedMap = new Map(publishedCounts.map((v) => [v.version, v._count.id]));

    // Get total counts per version
    const allCounts = await db.changelogEntry.groupBy({
      by: ["version"],
      _count: { id: true },
    });
    const allMap = new Map(allCounts.map((v) => [v.version, v._count.id]));

    return c.json({
      ok: true,
      data: versions.map((v) => ({
        version: v.version,
        releaseDate: v._min.releaseDate?.toISOString().slice(0, 10) ?? null,
        count: allMap.get(v.version) ?? 0,
        publishedCount: publishedMap.get(v.version) ?? 0,
      })),
    });
  })

  .post(
    "/changelog/entries",
    zValidator(
      "json",
      z.object({
        version: z.string().min(1).max(64).default("Unreleased"),
        releaseDate: changelogDate.default(() => new Date().toISOString().slice(0, 10)),
        ...changelogFields,
        type: z.enum(["FEATURE", "FIX", "PERF", "SECURITY", "UI", "CHORE"]).default("FEATURE"),
        text: z.string().min(1).max(5000),
        sortOrder: z.number().int().min(-1000).max(1000).default(0),
        versionSummary: z.string().max(500).nullable().optional(),
        isPublished: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const adminSession = c.get("adminSession" as any);
      let entry;
      try {
        entry = await db.changelogEntry.create({
          data: {
            version: body.version,
            releaseDate: new Date(body.releaseDate),
            versionSummary: body.versionSummary ?? null,
            type: body.type,
            text: body.text,
            title: body.title ?? body.text.slice(0, 240),
            slug: body.slug ?? `update-${randomUUID()}`,
            body: body.body ?? null,
            category: body.category ?? (body.type === "FEATURE" ? "RELEASE" : "IMPROVEMENT"),
            tags: { create: (body.tags ?? []).map((tag) => ({ tag })) },
            sortOrder: body.sortOrder,
            isPublished: body.isPublished,
            publishedAt: body.isPublished ? new Date() : null,
            createdById: adminSession?.adminId === "service" ? null : adminSession?.adminId,
          },
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
          return c.json(
            {
              ok: false,
              error: { code: "slug_conflict", message: "This URL slug is already in use" },
            },
            409,
          );
        }
        throw err;
      }
      await recordAudit(c, "changelog.create", `changelog:${entry.id}`, null, entry);
      return c.json({ ok: true, data: entry }, 201);
    },
  )

  .patch(
    "/changelog/entries/:id",
    zValidator(
      "json",
      z.object({
        version: z.string().min(1).max(64).optional(),
        releaseDate: changelogDate.optional(),
        ...changelogFields,
        type: z.enum(["FEATURE", "FIX", "PERF", "SECURITY", "UI", "CHORE"]).optional(),
        text: z.string().min(1).max(5000).optional(),
        sortOrder: z.number().int().min(-1000).max(1000).optional(),
        versionSummary: z.string().max(500).nullable().optional(),
        isPublished: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const id = c.req.param("id");
      const body = c.req.valid("json");
      const before = await db.changelogEntry.findUnique({ where: { id } });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);

      if (body.slug !== undefined && body.slug !== (before.slug ?? `update-${id}`)) {
        return c.json(
          {
            ok: false,
            error: { code: "immutable_slug", message: "The URL slug cannot change after creation" },
          },
          400,
        );
      }
      const { tags, ...fields } = body;
      const updates: any = { ...fields };
      if (tags !== undefined)
        updates.tags = { deleteMany: {}, create: tags.map((tag) => ({ tag })) };
      if (body.releaseDate) updates.releaseDate = new Date(body.releaseDate);

      // Handle publish/unpublish
      if (body.isPublished === true && !before.isPublished) {
        updates.publishedAt = new Date();
      } else if (body.isPublished === false && before.isPublished) {
        updates.publishedAt = null;
      }

      const updated = await db.changelogEntry.update({ where: { id }, data: updates });
      await recordAudit(c, "changelog.update", `changelog:${id}`, before, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  .delete("/changelog/entries/:id", async (c) => {
    const id = c.req.param("id");
    const before = await db.changelogEntry.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    await db.changelogEntry.delete({ where: { id } });
    await recordAudit(c, "changelog.delete", `changelog:${id}`, before, null);
    return c.json({ ok: true, data: { id } });
  })

  .post("/changelog/entries/:id/publish", async (c) => {
    const id = c.req.param("id");
    const before = await db.changelogEntry.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const updated = await db.changelogEntry.update({
      where: { id },
      data: { isPublished: true, publishedAt: new Date() },
    });
    await recordAudit(c, "changelog.publish", `changelog:${id}`, before, updated);
    return c.json({ ok: true, data: updated });
  })

  .post("/changelog/entries/:id/unpublish", async (c) => {
    const id = c.req.param("id");
    const before = await db.changelogEntry.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const updated = await db.changelogEntry.update({
      where: { id },
      data: { isPublished: false, publishedAt: null },
    });
    await recordAudit(c, "changelog.unpublish", `changelog:${id}`, before, updated);
    return c.json({ ok: true, data: updated });
  })

  // =====================================================
  // Admin: FAQ
  // =====================================================
  .get("/faq", async (c) => {
    const items = await db.faqItem.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }] });
    return c.json({ ok: true, data: items });
  })

  .post(
    "/faq",
    zValidator(
      "json",
      z.object({
        question: z.string().min(1).max(500),
        answer: z.string().min(1).max(10000),
        category: z.string().min(1).max(100),
        order: z.number().int().default(0),
        published: z.boolean().default(true),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const item = await db.faqItem.create({ data: body });
      await recordAudit(c, "faq.create", `faq:${item.id}`, null, item);
      return c.json({ ok: true, data: item }, 201);
    },
  )

  .patch(
    "/faq/:id",
    zValidator(
      "json",
      z.object({
        question: z.string().min(1).max(500).optional(),
        answer: z.string().min(1).max(10000).optional(),
        category: z.string().min(1).max(100).optional(),
        order: z.number().int().optional(),
        published: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const id = c.req.param("id");
      const body = c.req.valid("json");
      const before = await db.faqItem.findUnique({ where: { id } });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      const updated = await db.faqItem.update({ where: { id }, data: body });
      await recordAudit(c, "faq.update", `faq:${id}`, before, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  .delete("/faq/:id", async (c) => {
    const id = c.req.param("id");
    const before = await db.faqItem.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    await db.faqItem.delete({ where: { id } });
    await recordAudit(c, "faq.delete", `faq:${id}`, before, null);
    return c.json({ ok: true, data: { id } });
  })

  // =====================================================
  // Admin: Status Page Incidents
  // =====================================================
  .get("/incidents", async (c) => {
    const items = await db.incident.findMany({ orderBy: { createdAt: "desc" } });
    return c.json({ ok: true, data: items });
  })

  .get("/incidents/:id", async (c) => {
    const incident = await db.incident.findUnique({ where: { id: c.req.param("id") } });
    if (!incident) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    return c.json({ ok: true, data: incident });
  })

  .post(
    "/incidents",
    zValidator(
      "json",
      z.object({
        title: z.string().min(1).max(200),
        message: z.string().min(1).max(10000),
        status: z
          .enum(["investigating", "identified", "monitoring", "resolved"])
          .default("investigating"),
        severity: z.enum(["minor", "major", "critical"]).default("minor"),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const incident = await db.incident.create({
        data: {
          ...body,
          updates: [
            { status: body.status, message: body.message, timestamp: new Date().toISOString() },
          ],
        },
      });
      await recordAudit(c, "incident.create", `incident:${incident.id}`, null, incident);
      return c.json({ ok: true, data: incident }, 201);
    },
  )

  .patch(
    "/incidents/:id",
    zValidator(
      "json",
      z.object({
        status: z.enum(["investigating", "identified", "monitoring", "resolved"]).optional(),
        message: z.string().min(1).max(10000).optional(),
        resolvedAt: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const id = c.req.param("id");
      const body = c.req.valid("json");
      const before = await db.incident.findUnique({ where: { id } });
      if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
      const updates: { status: string; message: string; timestamp: string }[] =
        (before.updates as any) ?? [];
      if (body.message) {
        updates.push({
          status: body.status ?? before.status,
          message: body.message,
          timestamp: new Date().toISOString(),
        });
      }
      const updated = await db.incident.update({
        where: { id },
        data: {
          ...body,
          resolvedAt:
            body.resolvedAt !== undefined
              ? body.resolvedAt
                ? new Date(body.resolvedAt)
                : null
              : undefined,
          updates: updates as any,
        },
      });
      await recordAudit(c, "incident.update", `incident:${id}`, before, updated);
      return c.json({ ok: true, data: updated });
    },
  )

  // =====================================================
  // Admin: Email Log
  // =====================================================
  .get("/email-log", async (c) => {
    const search = stringQuery(c.req.query("search"), "search", 120);
    const status = stringQuery(c.req.query("status"), "status", 64);
    const template = stringQuery(c.req.query("template"), "template", 120);
    const sort =
      enumQuery(c.req.query("sort"), "sort", ["createdAt", "to", "status", "template"] as const) ??
      "createdAt";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const where: any = {};
    if (status) where.status = status;
    if (template) where.template = template;
    if (search) {
      where.OR = [
        { to: { contains: search } },
        { subject: { contains: search } },
        { template: { contains: search } },
        { providerId: { contains: search } },
      ];
    }
    const [items, total] = await Promise.all([
      db.emailLog.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.emailLog.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  // =====================================================
  // Admin: Newsletter Subscribers
  // =====================================================
  .get("/newsletter", async (c) => {
    const status = enumQuery(c.req.query("status"), "status", [
      "ACTIVE",
      "UNSUBSCRIBED",
      "BOUNCED",
    ] as const);
    const search = stringQuery(c.req.query("search"), "search");
    const sort =
      enumQuery(c.req.query("sort"), "sort", [
        "subscribedAt",
        "email",
        "name",
        "status",
      ] as const) ?? "subscribedAt";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [{ email: { contains: search } }, { name: { contains: search } }];
    }
    const [items, total] = await Promise.all([
      db.newsletterSubscriber.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.newsletterSubscriber.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  .get("/newsletter/stats", async (c) => {
    const [active, unsubscribed, bounced, total] = await Promise.all([
      db.newsletterSubscriber.count({ where: { status: "ACTIVE" } }),
      db.newsletterSubscriber.count({ where: { status: "UNSUBSCRIBED" } }),
      db.newsletterSubscriber.count({ where: { status: "BOUNCED" } }),
      db.newsletterSubscriber.count(),
    ]);
    return c.json({ ok: true, data: { active, unsubscribed, bounced, total } });
  })

  .delete("/newsletter/:id", async (c) => {
    const id = c.req.param("id");
    const before = await db.newsletterSubscriber.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    await db.newsletterSubscriber.delete({ where: { id } });
    await recordAudit(c, "newsletter.delete", `newsletter:${id}`, before, null);
    return c.json({ ok: true, data: { id } });
  })

  // =====================================================
  // Admin: Usage Records
  // =====================================================
  .get("/usage", async (c) => {
    const search = stringQuery(c.req.query("search"), "search", 120);
    const metric = stringQuery(c.req.query("metric"), "metric", 100);
    const sort =
      enumQuery(c.req.query("sort"), "sort", [
        "quantity",
        "metric",
        "userId",
        "month",
        "year",
      ] as const) ?? "quantity";
    const order = enumQuery(c.req.query("order"), "order", ["asc", "desc"] as const) ?? "desc";
    const month = integerQuery(c.req.query("month"), {
      name: "month",
      defaultValue: new Date().getMonth() + 1,
      max: 12,
    });
    const year = integerQuery(c.req.query("year"), {
      name: "year",
      defaultValue: new Date().getFullYear(),
      min: 2000,
      max: 2100,
    });
    const where: any = { month, year };
    if (metric) where.metric = metric;
    if (search) {
      where.OR = [
        { metric: { contains: search } },
        { userId: { contains: search } },
        { user: { email: { contains: search } } },
        { user: { name: { contains: search } } },
      ];
    }
    const page = integerQuery(c.req.query("page"), { name: "page", defaultValue: 1, max: 100_000 });
    const limit = limitQuery(c.req.query("limit"), 50, 200);
    const [items, total] = await Promise.all([
      db.usageRecord.findMany({
        where,
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.usageRecord.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  });
