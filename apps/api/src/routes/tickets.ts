import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  assignTicketSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  replyTicketSchema,
  updateTicketPrioritySchema,
  updateTicketStatusSchema,
} from "@actorconsole/shared";
import { db } from "@actorconsole/db";
import { recordAudit } from "./admin";
import { sendTicketReplyEmail } from "../lib/email";
import { checkRateLimit } from "../lib/rate-limit";
import { trackEvent } from "../lib/analytics";
import type { AppEnv } from "../app.js";
import { requireInteractiveSession } from "../middleware/auth.js";

function isAdmin(c: any): boolean {
  const a = c.get?.("adminSession" as any);
  return a && (a.role === "ADMIN" || a.role === "SUPER_ADMIN");
}

async function notifyAuthor(opts: {
  to: string;
  toName?: string | null;
  ticketNumber: number;
  ticketSubject: string;
  fromName: string;
  replyBody: string;
}) {
  void sendTicketReplyEmail(opts.to, {
    userName: opts.toName ?? undefined,
    ticketNumber: opts.ticketNumber,
    ticketSubject: opts.ticketSubject,
    fromName: opts.fromName,
    replyBody: opts.replyBody,
  });
}

export const ticketRoutes = new Hono<AppEnv>()
  .use("*", requireInteractiveSession())
  // ---- user actions ----

  .post("/", zValidator("json", createTicketSchema), async (c) => {
    const session = c.get("session");
    const body = c.req.valid("json");
    const rate = await checkRateLimit(`ticket:create:${session.userId}`, {
      label: "Ticket creation",
      windowMs: 3600000,
      max: 5,
    });
    if (!rate.allowed) {
      return c.json(
        {
          ok: false,
          error: { code: "rate_limited", message: "Too many tickets. Try again later." },
        },
        429,
      );
    }
    const actor = body.actorId
      ? await db.actor.findFirst({
          where: {
            id: body.actorId,
            userId: session.userId,
            ...(session.businessProfileId
              ? { businessProfileId: session.businessProfileId }
              : { businessProfileId: "__workspace_not_selected__" }),
          },
          select: { id: true, title: true, actorName: true, apifyActorId: true },
        })
      : null;
    if (body.actorId && !actor) {
      return c.json(
        {
          ok: false,
          error: {
            code: "actor_not_found",
            message: "The selected Actor is not available in this workspace",
          },
        },
        404,
      );
    }
    const ticket = await db.ticket.create({
      data: {
        userId: session.userId,
        businessProfileId: session.businessProfileId ?? null,
        actorId: actor?.id ?? null,
        subject: body.subject,
        category: body.category,
        priority: body.priority ?? "NORMAL",
        status: "OPEN",
        lastReplyAt: new Date(),
        messages: {
          create: {
            authorId: session.userId,
            authorType: "USER",
            body: body.body,
            attachments: (body.attachments ?? undefined) as any,
          },
        },
      },
      include: {
        messages: true,
        actor: {
          select: { id: true, title: true, actorName: true, apifyActorId: true },
        },
      },
    });
    trackEvent("ticket.created", {
      userId: session.userId,
      properties: { ticketId: ticket.id, category: body.category },
    });
    // Best-effort: notify all admins
    const admins = await db.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      select: { email: true, name: true },
    });
    for (const admin of admins) {
      void notifyAuthor({
        to: admin.email,
        toName: admin.name,
        ticketNumber: ticket.number,
        ticketSubject: ticket.subject,
        fromName: session.email,
        replyBody: body.body,
      });
    }
    if (session.businessProfileId) {
      void db.notification
        .create({
          data: {
            userId: session.userId,
            businessProfileId: session.businessProfileId,
            type: "support.ticket-created",
            title: `Support ticket AL-${ticket.number} opened`,
            body: actor ? `${actor.title ?? actor.actorName} · ${ticket.subject}` : ticket.subject,
            link: `/dashboard/support/${ticket.id}`,
            dedupeKey: `support-ticket-created:${ticket.id}`,
          },
        })
        .catch(() => undefined);
    }
    return c.json({ ok: true, data: ticket }, 201);
  })

  .get("/", zValidator("query", listTicketsQuerySchema), async (c) => {
    const session = c.get("session");
    const q = c.req.valid("query");
    const where: any = isAdmin(c) ? {} : { userId: session.userId };
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.category) where.category = q.category;
    if (q.assignedToId) where.assignedToId = q.assignedToId;
    if (q.unassigned) where.assignedToId = null;
    if (q.q) {
      where.OR = [{ subject: { contains: q.q } }, { user: { email: { contains: q.q } } }];
    }
    const [items, total] = await Promise.all([
      db.ticket.findMany({
        where,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          user: { select: { id: true, email: true, name: true } },
          assignedTo: { select: { id: true, email: true, name: true } },
          actor: { select: { id: true, title: true, actorName: true, apifyActorId: true } },
          _count: { select: { messages: true } },
        },
      }),
      db.ticket.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page: q.page, limit: q.limit } });
  })

  .get("/:id", async (c) => {
    const session = c.get("session");
    const id = c.req.param("id");
    const requestedMessagePage = Number(c.req.query("messagePage") ?? 1);
    const messagePage =
      Number.isFinite(requestedMessagePage) && requestedMessagePage > 0
        ? Math.floor(requestedMessagePage)
        : 1;
    const requestedMessageLimit = Number(c.req.query("messageLimit") ?? 50);
    const messageLimit = [25, 50, 100].includes(requestedMessageLimit) ? requestedMessageLimit : 50;
    const ticket = await db.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        assignedTo: { select: { id: true, email: true, name: true } },
        actor: { select: { id: true, title: true, actorName: true, apifyActorId: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          skip: (messagePage - 1) * messageLimit,
          take: messageLimit,
        },
        _count: { select: { messages: true } },
      },
    });
    if (!ticket) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    if (!isAdmin(c) && ticket.userId !== session.userId) {
      return c.json({ ok: false, error: { code: "forbidden" } }, 403);
    }
    return c.json({
      ok: true,
      data: {
        ...ticket,
        // The UI reads conversations oldest-to-newest within the selected
        // window, while the query stays newest-first for a bounded page.
        messages: [...ticket.messages].reverse(),
        messagePage,
        messageLimit,
        messageTotal: ticket._count?.messages ?? ticket.messages.length,
      },
    });
  })

  .post("/:id/messages", zValidator("json", replyTicketSchema), async (c) => {
    const session = c.get("session");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const rate = await checkRateLimit(`ticket:reply:${session.userId}`, {
      label: "Ticket reply",
      windowMs: 3600000,
      max: 30,
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
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!ticket) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const admin = isAdmin(c);
    if (!admin && ticket.userId !== session.userId) {
      return c.json({ ok: false, error: { code: "forbidden" } }, 403);
    }
    if (ticket.status === "CLOSED") {
      return c.json({ ok: false, error: { code: "ticket_closed" } }, 409);
    }

    const authorType = admin ? "ADMIN" : "USER";
    const newStatus = admin ? "RESPONDED" : "PENDING";

    const [message] = await db.$transaction([
      db.ticketMessage.create({
        data: {
          ticketId: id,
          authorId: session.userId,
          authorType,
          body: body.body,
          attachments: (body.attachments ?? undefined) as any,
        },
      }),
      db.ticket.update({
        where: { id },
        data: { lastReplyAt: new Date(), status: newStatus },
      }),
    ]);

    // Notify the *other* party
    if (admin) {
      void notifyAuthor({
        to: ticket.user.email,
        toName: ticket.user.name,
        ticketNumber: ticket.number,
        ticketSubject: ticket.subject,
        fromName: session.email,
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
    } else {
      const admins = await db.user.findMany({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
        select: { email: true, name: true },
      });
      for (const a of admins) {
        void notifyAuthor({
          to: a.email,
          toName: a.name,
          ticketNumber: ticket.number,
          ticketSubject: ticket.subject,
          fromName: session.email,
          replyBody: body.body,
        });
      }
    }

    return c.json({ ok: true, data: message }, 201);
  })

  .post("/:id/close", async (c) => {
    const session = c.get("session");
    const id = c.req.param("id");
    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    if (!isAdmin(c) && ticket.userId !== session.userId) {
      return c.json({ ok: false, error: { code: "forbidden" } }, 403);
    }
    const updated = await db.ticket.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    await recordAudit(c, "ticket.close", `ticket:${id}`, ticket, updated);
    return c.json({ ok: true, data: updated });
  })

  // ---- admin actions ----

  .post("/:id/status", zValidator("json", updateTicketStatusSchema), async (c) => {
    if (!isAdmin(c)) return c.json({ ok: false, error: { code: "forbidden" } }, 403);
    const id = c.req.param("id");
    const { status } = c.req.valid("json");
    const before = await db.ticket.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const updated = await db.ticket.update({
      where: { id },
      data: {
        status,
        closedAt: status === "CLOSED" ? new Date() : before.closedAt,
      },
    });
    await recordAudit(c, "ticket.status", `ticket:${id}`, before, updated);
    return c.json({ ok: true, data: updated });
  })

  .post("/:id/assign", zValidator("json", assignTicketSchema), async (c) => {
    if (!isAdmin(c)) return c.json({ ok: false, error: { code: "forbidden" } }, 403);
    const id = c.req.param("id");
    const { assignedToId } = c.req.valid("json");
    if (assignedToId) {
      const target = await db.user.findUnique({ where: { id: assignedToId } });
      if (!target || (target.role !== "ADMIN" && target.role !== "SUPER_ADMIN")) {
        return c.json({ ok: false, error: { code: "not_an_admin" } }, 400);
      }
    }
    const before = await db.ticket.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const updated = await db.ticket.update({ where: { id }, data: { assignedToId } });
    await recordAudit(c, "ticket.assign", `ticket:${id}`, before, updated);
    return c.json({ ok: true, data: updated });
  })

  .post("/:id/priority", zValidator("json", updateTicketPrioritySchema), async (c) => {
    if (!isAdmin(c)) return c.json({ ok: false, error: { code: "forbidden" } }, 403);
    const id = c.req.param("id");
    const { priority } = c.req.valid("json");
    const before = await db.ticket.findUnique({ where: { id } });
    if (!before) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const updated = await db.ticket.update({ where: { id }, data: { priority } });
    await recordAudit(c, "ticket.priority", `ticket:${id}`, before, updated);
    return c.json({ ok: true, data: updated });
  });
