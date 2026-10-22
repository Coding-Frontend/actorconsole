import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the /notifications route (Phase 2.1).
 *
 * GET /, POST /:id/read, POST /read-all
 */

const {
  mockDb,
  getUserApifyClient,
  listConsoleNotifications,
  markConsoleNotificationRead,
  markAllConsoleNotificationsRead,
} = vi.hoisted(() => ({
  mockDb: {
    notification: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    actor: {
      findMany: vi.fn(),
    },
    ticket: {
      findFirst: vi.fn(),
    },
  },
  getUserApifyClient: vi.fn(),
  listConsoleNotifications: vi.fn(),
  markConsoleNotificationRead: vi.fn(),
  markAllConsoleNotificationsRead: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({ db: mockDb }));
vi.mock("@actorconsole/apify", () => ({ getUserApifyClient }));

vi.mock("../../src/middleware/auth.js", () => ({
  requireAuth: () => async (c: any, next: any) => {
    c.set("session", {
      userId: "user_test_1",
      email: "t@a.com",
      plan: "FREE",
      businessProfileId: "workspace_1",
    });
    await next();
  },
}));

import { notificationRoutes } from "../../src/routes/notifications.js";

function buildApp() {
  const app = new Hono();
  app.route("/", notificationRoutes);
  return app;
}

const sampleNotification = {
  id: "n_1",
  userId: "user_test_1",
  businessProfileId: "workspace_1",
  title: "Snapshot captured",
  body: "Your actor's stats were updated.",
  link: "/dashboard/actors",
  readAt: null,
  createdAt: "2026-07-01T10:00:00.000Z",
};

describe("notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserApifyClient.mockResolvedValue(null);
    mockDb.actor.findMany.mockResolvedValue([]);
    mockDb.ticket.findFirst.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /", () => {
    it("returns items, total, and unread counts for the user", async () => {
      mockDb.notification.findMany
        .mockResolvedValueOnce([{ type: "SNAPSHOT" }])
        .mockResolvedValueOnce([sampleNotification]);
      // Promise.all fires both count() calls in parallel, so use mockImplementation
      // (not mockResolvedValueOnce) to dispatch by the where argument.
      mockDb.notification.count.mockImplementation(async (args: any) => {
        if (args?.where?.readAt === null) return 3; // unread
        return 15; // total
      });

      const res = await buildApp().request("/");
      const body = await res.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          total: 15,
          unread: 3,
          page: 1,
          limit: 50,
          items: [sampleNotification],
          availableTypes: ["SNAPSHOT"],
        },
      });
      expect(mockDb.notification.findMany).toHaveBeenCalledWith({
        where: { userId: "user_test_1", businessProfileId: "workspace_1" },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });

    it("clamps the limit to a maximum of 100", async () => {
      mockDb.notification.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockDb.notification.count.mockReset();
      mockDb.notification.count.mockResolvedValue(0);
      await buildApp().request("/?limit=9999");
      expect(mockDb.notification.findMany.mock.calls[1][0].take).toBe(100);
    });

    it("paginates the merged notification feed", async () => {
      const newest = { ...sampleNotification, id: "n_new", createdAt: "2026-08-12T12:00:00.000Z" };
      const middle = { ...sampleNotification, id: "n_mid", createdAt: "2026-08-12T11:00:00.000Z" };
      const oldest = { ...sampleNotification, id: "n_old", createdAt: "2026-08-12T10:00:00.000Z" };
      mockDb.notification.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([newest, middle, oldest]);
      mockDb.notification.count.mockResolvedValue(3);

      const res = await buildApp().request("/?page=2&limit=2");
      const body = await res.json();

      expect(mockDb.notification.findMany.mock.calls[1][0].take).toBe(4);
      expect(body.data).toMatchObject({ page: 2, limit: 2, total: 3 });
      expect(body.data.items.map((item: any) => item.id)).toEqual(["n_old"]);
    });

    it("filters by readAt=null when ?unread=true", async () => {
      mockDb.notification.findMany.mockReset();
      mockDb.notification.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockDb.notification.count.mockReset();
      mockDb.notification.count.mockResolvedValue(0);
      await buildApp().request("/?unread=true");
      const where = mockDb.notification.findMany.mock.calls[1][0].where;
      expect(where).toEqual({
        userId: "user_test_1",
        businessProfileId: "workspace_1",
        readAt: null,
      });
    });

    it("merges Apify Console notifications into the workspace feed", async () => {
      mockDb.notification.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sampleNotification]);
      mockDb.notification.count.mockImplementation(async (args: any) =>
        args?.where?.readAt === null ? 1 : 1,
      );
      listConsoleNotifications.mockResolvedValueOnce([
        {
          _id: "apify_1",
          userId: "apify_user",
          kind: "ACTOR_UNDER_MAINTENANCE",
          createdAt: "2026-08-12T10:00:00.000Z",
          subject: "<strong>Actor needs attention</strong>",
          body: "Quality check failed &amp; the Actor was paused.",
          url: "/actors/runs/run_1",
          deliveryStatus: { ui: {} },
        },
      ]);
      getUserApifyClient.mockResolvedValueOnce({ listConsoleNotifications });

      const res = await buildApp().request("/");
      const body = await res.json();

      expect(body.data).toMatchObject({
        total: 2,
        unread: 2,
        sources: {
          actorconsole: { available: true, total: 1 },
          apify: { configured: true, available: true, total: 1 },
        },
      });
      expect(body.data.items[0]).toMatchObject({
        id: "apify:apify_1",
        type: "apify:ACTOR_UNDER_MAINTENANCE",
        title: "Actor needs attention",
        body: "Quality check failed & the Actor was paused.",
        link: "https://console.apify.com/actors/runs/run_1",
        source: "apify",
      });
    });

    it("keeps local notifications available when the Apify feed fails", async () => {
      mockDb.notification.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([sampleNotification]);
      mockDb.notification.count.mockResolvedValue(1);
      listConsoleNotifications.mockRejectedValueOnce(new Error("socket unavailable"));
      getUserApifyClient.mockResolvedValueOnce({ listConsoleNotifications });

      const res = await buildApp().request("/");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.sources.apify).toEqual({ configured: true, available: false, total: 0 });
    });
  });

  describe("POST /:id/read", () => {
    it("marks the notification as read for the user", async () => {
      mockDb.notification.updateMany.mockResolvedValueOnce({ count: 1 });
      const res = await buildApp().request("/n_1/read", { method: "POST" });
      expect(res.status).toBe(200);
      expect(mockDb.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: "n_1",
          userId: "user_test_1",
          businessProfileId: "workspace_1",
        },
        data: { readAt: expect.any(Date) },
      });
    });

    it("marks an Apify Console notification as read without touching the local table", async () => {
      markConsoleNotificationRead.mockResolvedValueOnce(undefined);
      getUserApifyClient.mockResolvedValueOnce({ markConsoleNotificationRead });

      const res = await buildApp().request("/apify%3Anotification_1/read", { method: "POST" });

      expect(res.status).toBe(200);
      expect(markConsoleNotificationRead).toHaveBeenCalledWith("notification_1");
      expect(mockDb.notification.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("GET /:id", () => {
    it("resolves an Actor and maintenance remediation for a local notification", async () => {
      mockDb.notification.findFirst.mockResolvedValueOnce({
        ...sampleNotification,
        type: "actor.under-maintenance",
        title: "Google Maps Scraper is under maintenance",
        body: "Review google-maps-scraper before restoring it.",
      });
      mockDb.actor.findMany.mockResolvedValueOnce([
        {
          id: "actor_db_1",
          apifyActorId: "acme~google-maps-scraper",
          username: "acme",
          actorName: "google-maps-scraper",
          title: "Google Maps Scraper",
          description: "Maps data",
          currentImageUrl: null,
          storeIsPublic: true,
          storeIsDeprecated: true,
          storeNotice: "UNDER_MAINTENANCE",
          storeStatusSyncedAt: new Date("2026-08-12T10:00:00.000Z"),
        },
      ]);

      const res = await buildApp().request("/n_1");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({
        id: "n_1",
        actionKind: "clear-maintenance",
        actor: { id: "actor_db_1", apifyActorId: "acme~google-maps-scraper" },
        actions: [{ id: "clear-maintenance", label: "Clear maintenance" }],
      });
    });

    it("returns linked support-ticket context and its referenced Actor", async () => {
      mockDb.notification.findFirst.mockResolvedValueOnce({
        ...sampleNotification,
        type: "support.reply",
        title: "Support replied to AL-1001",
        link: "/dashboard/support/tk_1",
      });
      mockDb.ticket.findFirst.mockResolvedValueOnce({
        id: "tk_1",
        number: 1001,
        userId: "user_test_1",
        subject: "Google Maps Scraper fails to start",
        status: "RESPONDED",
        priority: "HIGH",
        category: "TECHNICAL",
        lastReplyAt: new Date("2026-08-12T10:00:00.000Z"),
        updatedAt: new Date("2026-08-12T10:00:00.000Z"),
        messages: [{ body: "Please review google-maps-scraper." }],
      });
      mockDb.actor.findMany.mockResolvedValueOnce([
        {
          id: "actor_db_1",
          apifyActorId: "acme~google-maps-scraper",
          username: "acme",
          actorName: "google-maps-scraper",
          title: "Google Maps Scraper",
          description: null,
          currentImageUrl: null,
          storeIsPublic: true,
          storeIsDeprecated: false,
          storeNotice: "NONE",
          storeStatusSyncedAt: null,
        },
      ]);

      const res = await buildApp().request("/n_1");
      const body = await res.json();

      expect(body.data).toMatchObject({
        actionKind: "support-ticket",
        actor: { id: "actor_db_1" },
        ticket: { id: "tk_1", number: 1001, status: "RESPONDED" },
        actions: [{ id: "open-ticket" }],
      });
      expect(mockDb.ticket.findFirst).toHaveBeenCalledWith({
        where: {
          id: "tk_1",
          userId: "user_test_1",
          businessProfileId: "workspace_1",
        },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 3 } },
      });
    });

    it("loads an Apify notification by its prefixed ID", async () => {
      listConsoleNotifications.mockResolvedValueOnce([
        {
          _id: "apify_1",
          userId: "apify_user",
          kind: "ACTOR_DEPRECATED",
          createdAt: "2026-08-12T10:00:00.000Z",
          subject: "Instagram Scraper was deprecated",
          body: "Review instagram-scraper.",
          deliveryStatus: { ui: {} },
        },
      ]);
      getUserApifyClient.mockResolvedValueOnce({ listConsoleNotifications });
      mockDb.actor.findMany.mockResolvedValueOnce([
        {
          id: "actor_db_2",
          apifyActorId: "acme~instagram-scraper",
          username: "acme",
          actorName: "instagram-scraper",
          title: "Instagram Scraper",
          description: null,
          currentImageUrl: null,
          storeIsPublic: true,
          storeIsDeprecated: true,
          storeNotice: "NONE",
          storeStatusSyncedAt: null,
        },
      ]);

      const res = await buildApp().request("/apify%3Aapify_1");
      const body = await res.json();

      expect(body.data).toMatchObject({
        id: "apify:apify_1",
        actionKind: "clear-deprecated",
        actor: { id: "actor_db_2" },
        actions: [{ id: "clear-deprecated" }],
      });
    });
  });

  describe("POST /read-all", () => {
    it("marks every unread notification as read for the user", async () => {
      mockDb.notification.updateMany.mockResolvedValueOnce({ count: 5 });
      const res = await buildApp().request("/read-all", { method: "POST" });
      expect(res.status).toBe(200);
      expect(mockDb.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "user_test_1",
          businessProfileId: "workspace_1",
          readAt: null,
        },
        data: { readAt: expect.any(Date) },
      });
    });

    it("marks both local and Apify Console notifications as read", async () => {
      mockDb.notification.updateMany.mockResolvedValueOnce({ count: 2 });
      markAllConsoleNotificationsRead.mockResolvedValueOnce(undefined);
      getUserApifyClient.mockResolvedValueOnce({ markAllConsoleNotificationsRead });

      const res = await buildApp().request("/read-all", { method: "POST" });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(markAllConsoleNotificationsRead).toHaveBeenCalledOnce();
      expect(body.data).toEqual({
        actorconsoleUpdated: 2,
        apifyConfigured: true,
        apifySynced: true,
      });
    });
  });
});
