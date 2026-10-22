import { Hono } from "hono";
import { db } from "@actorconsole/db";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/error.js";
import { getUserApifyClient, type ApifyConsoleNotification } from "@actorconsole/apify";
import type { AppEnv } from "../app.js";
import { booleanQuery, integerQuery, limitQuery } from "../lib/query.js";
import { assertApiKeyCapability } from "../middleware/api-key-scope.js";

const APIFY_NOTIFICATION_PREFIX = "apify:";
const APIFY_FEED_BUDGET_MS = 400;

function withinBudget<T>(promise: Promise<T>, fallback: T, budgetMs: number): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), budgetMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function textFromNotificationHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeApifyNotificationLink(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://console.apify.com");
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "console.apify.com" && url.hostname !== "apify.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function toNotificationItem(notification: ApifyConsoleNotification) {
  const id = `${APIFY_NOTIFICATION_PREFIX}${notification._id}`;
  return {
    id,
    type: `apify:${notification.kind}`,
    title: textFromNotificationHtml(notification.subject),
    body: textFromNotificationHtml(notification.body) || null,
    link: safeApifyNotificationLink(notification.url),
    detailHref: `/dashboard/notifications/${encodeURIComponent(id)}`,
    readAt: notification.deliveryStatus?.ui?.readAt ?? null,
    createdAt: notification.createdAt,
    source: "apify" as const,
  };
}

function toLocalNotificationItem(notification: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
}) {
  return {
    ...notification,
    detailHref: `/dashboard/notifications/${encodeURIComponent(notification.id)}`,
    source: "actorconsole" as const,
  };
}

type NotificationFeedItem =
  ReturnType<typeof toNotificationItem> | ReturnType<typeof toLocalNotificationItem>;

function decodedNotificationText(item: NotificationFeedItem, extra = "") {
  const raw = [item.type, item.title, item.body ?? "", item.link ?? "", extra].join(" ");
  try {
    return `${raw} ${decodeURIComponent(raw)}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function notificationActionKind(item: NotificationFeedItem, hasTicket: boolean) {
  const text = decodedNotificationText(item);
  if (hasTicket || /support|ticket/.test(text)) return "support-ticket" as const;
  if (/under[_ -]?maintenance|maintenance/.test(text)) return "clear-maintenance" as const;
  if (/deprecat|depreciat/.test(text)) return "clear-deprecated" as const;
  return "review" as const;
}

function ticketIdFromLink(link: string | null): string | null {
  if (!link) return null;
  const match = link.match(/\/dashboard\/support\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function actorMatchScore(
  actor: { id: string; apifyActorId: string; actorName: string; title: string | null },
  haystack: string,
) {
  const candidates = [actor.id, actor.apifyActorId, actor.actorName, actor.title ?? ""]
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 3)
    .sort((left, right) => right.length - left.length);
  const matched = candidates.find((candidate) => haystack.includes(candidate));
  return matched?.length ?? 0;
}

async function buildNotificationDetail(
  item: NotificationFeedItem,
  session: AppEnv["Variables"]["session"],
) {
  const linkedTicketId = ticketIdFromLink(item.link);
  const ticket = linkedTicketId
    ? await db.ticket.findFirst({
        where: {
          id: linkedTicketId,
          userId: session.userId,
          businessProfileId: session.businessProfileId,
        },
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 3 },
        },
      })
    : null;
  const ticketText = ticket
    ? [ticket.subject, ...ticket.messages.map((message) => message.body)].join(" ")
    : "";
  const haystack = decodedNotificationText(item, ticketText);
  const actors = await db.actor.findMany({
    where: {
      userId: session.userId,
      businessProfileId: session.businessProfileId!,
    },
    select: {
      id: true,
      apifyActorId: true,
      username: true,
      actorName: true,
      title: true,
      description: true,
      currentImageUrl: true,
      storeIsPublic: true,
      storeIsDeprecated: true,
      storeNotice: true,
      storeStatusSyncedAt: true,
    },
    take: 10_000,
  });
  const actor =
    (ticket?.actorId ? actors.find((candidate) => candidate.id === ticket.actorId) : null) ??
    actors
      .map((candidate) => ({ candidate, score: actorMatchScore(candidate, haystack) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.candidate;
  const actionKind = notificationActionKind(item, Boolean(ticket));
  const actions = [
    ...(actionKind === "clear-maintenance" && actor
      ? [
          {
            id: "clear-maintenance" as const,
            label: "Clear maintenance",
            description:
              "Remove the under-maintenance notice. Apify also clears the deprecated flag when this action runs.",
          },
        ]
      : []),
    ...(actionKind === "clear-deprecated" && actor
      ? [
          {
            id: "clear-deprecated" as const,
            label: "Clear deprecated status",
            description: "Mark this Actor as active and not deprecated in the Apify Store.",
          },
        ]
      : []),
    ...(ticket
      ? [
          {
            id: "open-ticket" as const,
            label: `Open ticket AL-${ticket.number}`,
            description: "Review the support conversation and reply from the ticket page.",
          },
        ]
      : []),
  ];

  return {
    ...item,
    actionKind,
    actionNeeded:
      actionKind === "clear-maintenance"
        ? actor
          ? "Review the Actor and clear maintenance when it is ready to operate again."
          : "Connect or synchronize the referenced Actor before clearing maintenance."
        : actionKind === "clear-deprecated"
          ? actor
            ? "Review the Actor and clear its deprecated status when it is supported again."
            : "Connect or synchronize the referenced Actor before clearing its deprecated status."
          : actionKind === "support-ticket"
            ? "Review the support conversation and reply if the requester needs an update."
            : "Review this notification and follow its linked context if action is required.",
    actor: actor
      ? {
          ...actor,
          href: `/dashboard/actors/${encodeURIComponent(actor.apifyActorId)}`,
        }
      : null,
    ticket: ticket
      ? {
          id: ticket.id,
          number: ticket.number,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          lastReplyAt: ticket.lastReplyAt,
          updatedAt: ticket.updatedAt,
          href: `/dashboard/support/${encodeURIComponent(ticket.id)}`,
        }
      : null,
    actions,
  };
}

export const notificationRoutes = new Hono<AppEnv>()
  .use("*", requireAuth())

  // GET /notifications — list user's notifications, newest first
  .get("/", async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "notifications:read");
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    const limit = limitQuery(c.req.query("limit"), 50, 100);
    const page = integerQuery(c.req.query("page"), {
      name: "page",
      defaultValue: 1,
      max: 100,
    });
    const offset = (page - 1) * limit;
    const unreadOnly = booleanQuery(c.req.query("unread"), "unread") ?? false;
    const source = c.req.query("source") ?? "all";
    if (!["all", "actorconsole", "apify"].includes(source)) {
      throw new AppError("invalid_query", "Invalid notification source", 400);
    }
    const type = c.req.query("type")?.trim().slice(0, 120);
    const from = c.req.query("from") ? new Date(c.req.query("from")!) : null;
    const to = c.req.query("to") ? new Date(c.req.query("to")!) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new AppError("invalid_query", "Invalid notification date filter", 400);
    }

    const where: any = {
      userId: session.userId,
      businessProfileId: session.businessProfileId,
    };
    if (unreadOnly) where.readAt = null;
    if (type) where.type = type;
    if (from || to)
      where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const typeRows = await db.notification.findMany({
      where: { userId: session.userId, businessProfileId: session.businessProfileId },
      select: { type: true },
      distinct: ["type"],
    });
    const localResults =
      source === "apify"
        ? Promise.resolve([[], 0, 0] as const)
        : Promise.all([
            db.notification.findMany({
              where,
              orderBy: { createdAt: "desc" },
              take: offset + limit,
            }),
            db.notification.count({ where }),
            db.notification.count({
              where: { ...where, readAt: null },
            }),
          ]);

    // The local feed is the critical path. Apify Console notifications are
    // useful enrichment, but a slow Console request must never delay local
    // publishing, schedule, or support notifications beyond a short budget.
    const apifyFeedPromise =
      source === "actorconsole"
        ? Promise.resolve({
            items: [] as ReturnType<typeof toNotificationItem>[],
            configured: false,
            available: false,
          })
        : (async () => {
            const apify = await getUserApifyClient(session.userId, session.businessProfileId);
            if (!apify) return { items: [], configured: false, available: false };
            try {
              return {
                items: (await apify.listConsoleNotifications()).map(toNotificationItem),
                configured: true,
                available: true,
              };
            } catch {
              return { items: [], configured: true, available: false };
            }
          })();
    const [localResult, apifyFeed] = await Promise.all([
      localResults,
      withinBudget(
        apifyFeedPromise,
        { items: [], configured: false, available: false },
        APIFY_FEED_BUDGET_MS,
      ),
    ]);
    const [items, total, unread] = localResult;
    const apifyItems = apifyFeed.items;
    const apifyAvailable = apifyFeed.available;
    const visibleApifyItems = unreadOnly
      ? apifyItems.filter((item) => item.readAt === null)
      : apifyItems;
    const filteredApifyItems = visibleApifyItems.filter((item) => {
      if (type && item.type !== type) return false;
      const createdAt = new Date(item.createdAt);
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      return true;
    });
    const combinedItems = [...items.map(toLocalNotificationItem), ...filteredApifyItems]
      .sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )
      .slice(offset, offset + limit);
    const apifyUnread = filteredApifyItems.filter((item) => item.readAt === null).length;

    return c.json({
      ok: true,
      data: {
        items: combinedItems,
        total: total + filteredApifyItems.length,
        unread: unread + apifyUnread,
        availableTypes: [
          ...new Set([...typeRows.map((row) => row.type), ...apifyItems.map((item) => item.type)]),
        ].sort(),
        page,
        limit,
        sources: {
          actorconsole: { available: true, total },
          apify: {
            configured: apifyFeed.configured,
            available: apifyAvailable,
            total: filteredApifyItems.length,
          },
        },
      },
    });
  })

  // POST /notifications/:id/read — mark as read
  .post("/:id/read", async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "notifications:write");
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    const id = c.req.param("id");
    if (id.startsWith(APIFY_NOTIFICATION_PREFIX)) {
      const notificationId = id.slice(APIFY_NOTIFICATION_PREFIX.length);
      if (!notificationId) throw new AppError("invalid_notification", "Invalid notification", 400);
      const apify = await getUserApifyClient(session.userId, session.businessProfileId);
      if (!apify) throw new AppError("apify_not_connected", "Apify is not connected", 409);
      await apify.markConsoleNotificationRead(notificationId);
      return c.json({ ok: true, data: { source: "apify" } });
    }
    await db.notification.updateMany({
      where: { id, userId: session.userId, businessProfileId: session.businessProfileId },
      data: { readAt: new Date() },
    });
    return c.json({ ok: true });
  })

  // POST /notifications/read-all — mark all as read
  .post("/read-all", async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "notifications:write");
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    const localResult = await db.notification.updateMany({
      where: {
        userId: session.userId,
        businessProfileId: session.businessProfileId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    const apify = await getUserApifyClient(session.userId, session.businessProfileId);
    let apifySynced = false;
    if (apify) {
      try {
        await apify.markAllConsoleNotificationsRead();
        apifySynced = true;
      } catch {
        // Return the partial result so the client can communicate that local
        // notifications were updated even if Console authentication expired.
      }
    }
    return c.json({
      ok: true,
      data: {
        actorconsoleUpdated: localResult.count,
        apifyConfigured: Boolean(apify),
        apifySynced,
      },
    });
  })

  // GET /notifications/:id — return a workspace-safe detail view with
  // resolved Actor or support-ticket context and available remediation.
  .get("/:id", async (c) => {
    const session = c.get("session");
    assertApiKeyCapability(session, "notifications:read");
    if (!session.businessProfileId) {
      throw new AppError("workspace_required", "Select a workspace first", 409);
    }
    const id = c.req.param("id");
    let item: NotificationFeedItem | null = null;
    if (id.startsWith(APIFY_NOTIFICATION_PREFIX)) {
      const notificationId = id.slice(APIFY_NOTIFICATION_PREFIX.length);
      const apify = await getUserApifyClient(session.userId, session.businessProfileId);
      if (!apify) throw new AppError("apify_not_connected", "Apify is not connected", 409);
      const notification = (await apify.listConsoleNotifications()).find(
        (candidate) => candidate._id === notificationId,
      );
      if (notification) item = toNotificationItem(notification);
    } else {
      const notification = await db.notification.findFirst({
        where: {
          id,
          userId: session.userId,
          businessProfileId: session.businessProfileId,
        },
      });
      if (notification) item = toLocalNotificationItem(notification);
    }
    if (!item) throw new AppError("not_found", "Notification not found", 404);
    return c.json({ ok: true, data: await buildNotificationDetail(item, session) });
  });
