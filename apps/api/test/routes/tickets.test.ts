import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for /tickets/* — support ticket system.
 *
 * Covers the full lifecycle from the user's perspective (create, list, get,
 * reply, close) and a couple of admin actions (status, assign). Email
 * notifications are fire-and-forget; we don't assert on them.
 */

const { mockDb, mockRateLimit, mockEmail, mockAnalytics, mockRecordAudit } = vi.hoisted(() => ({
  mockDb: {
    ticket: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    ticketMessage: {
      create: vi.fn(),
    },
    actor: {
      findFirst: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
  },
  mockRateLimit: { checkRateLimit: vi.fn() },
  mockEmail: {
    sendEmail: vi.fn(),
    textToHtml: vi.fn((t: string) => `<p>${t}</p>`),
    escapeHtml: vi.fn((s: string) => s),
  },
  mockAnalytics: { trackEvent: vi.fn() },
  mockRecordAudit: { recordAudit: vi.fn() },
}));

mockRateLimit.checkRateLimit.mockResolvedValue({
  allowed: true,
  remaining: 10,
  retryAfterMs: 0,
});

vi.mock("@actorconsole/db", () => ({ db: mockDb }));

vi.mock("../../src/middleware/auth.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/middleware/auth.js")>()),
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

vi.mock("../../src/lib/rate-limit.js", () => mockRateLimit);
vi.mock("../../src/lib/email.js", () => mockEmail);
vi.mock("../../src/lib/analytics", () => mockAnalytics);
vi.mock("../../src/routes/admin.js", () => mockRecordAudit);

import { requireAuth } from "../../src/middleware/auth.js";
import { ticketRoutes } from "../../src/routes/tickets.js";

function buildApp(opts: { admin?: boolean } = {}) {
  const app = new Hono();
  // The real app.ts mounts auth under /tickets/* via app.use, but here we
  // apply it to the whole app so sub-routes like /:id/messages still work.
  app.use("/*", requireAuth());
  if (opts.admin) {
    app.use("/*", async (c, next) => {
      c.set("adminSession" as any, { userId: "admin_1", role: "ADMIN", viaApiKey: false });
      await next();
    });
  }
  // The route file uses path-relative handlers (e.g. .post("/:id/messages")),
  // so we mount at the root — but the test request paths must match what the
  // routes actually define. The tickets route defines /, /:id, /:id/messages,
  // /:id/close, /:id/status, /:id/assign, /:id/priority.
  app.route("/", ticketRoutes);
  return app;
}

const sampleTicket = {
  id: "tk_1",
  number: 1001,
  userId: "user_test_1",
  subject: "Can't find my actor",
  category: "TECHNICAL",
  priority: "NORMAL",
  status: "OPEN",
  lastReplyAt: "2026-07-01T10:00:00.000Z",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:00:00.000Z",
};

describe("tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish defaults after clearAllMocks wipes implementations.
    mockRateLimit.checkRateLimit.mockReset();
    mockRateLimit.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterMs: 0,
    });
    mockDb.notification.create.mockResolvedValue({ id: "notification_1" });
  });

  describe("POST /", () => {
    it("creates a ticket with the initial message", async () => {
      mockDb.ticket.create.mockResolvedValueOnce({ ...sampleTicket, messages: [{ id: "m_1" }] });
      mockDb.user.findMany.mockResolvedValueOnce([]); // no admins to notify
      const app = buildApp();
      const req = new Request("http://localhost/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "Can't find my actor",
          category: "TECHNICAL",
          priority: "NORMAL",
          body: "I can't see my actor in the dashboard.",
        }),
      });
      const res = await app.fetch(req);
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe("tk_1");
      expect(mockDb.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_test_1",
            subject: "Can't find my actor",
            status: "OPEN",
          }),
        }),
      );
      expect(mockAnalytics.trackEvent).toHaveBeenCalledWith(
        "ticket.created",
        expect.objectContaining({ userId: "user_test_1" }),
      );
      expect(mockDb.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessProfileId: "workspace_1",
          type: "support.ticket-created",
          link: "/dashboard/support/tk_1",
        }),
      });
    });

    it("associates a ticket with an Actor from the active workspace", async () => {
      mockDb.actor.findFirst.mockResolvedValueOnce({
        id: "actor_1",
        title: "Maps Scraper",
        actorName: "maps-scraper",
        apifyActorId: "acme~maps-scraper",
      });
      mockDb.ticket.create.mockResolvedValueOnce({ ...sampleTicket, messages: [], number: 1001 });
      mockDb.user.findMany.mockResolvedValueOnce([]);

      const res = await buildApp().request("/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "Maps Actor is failing",
          category: "TECHNICAL",
          body: "The latest build fails.",
          actorId: "actor_1",
        }),
      });

      expect(res.status).toBe(201);
      expect(mockDb.actor.findFirst).toHaveBeenCalledWith({
        where: { id: "actor_1", userId: "user_test_1", businessProfileId: "workspace_1" },
        select: { id: true, title: true, actorName: true, apifyActorId: true },
      });
      expect(mockDb.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: "actor_1",
            businessProfileId: "workspace_1",
          }),
        }),
      );
    });

    it("returns 429 when rate limit exceeded", async () => {
      mockRateLimit.checkRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfterMs: 60_000,
      });
      const res = await buildApp().request("/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "valid subject",
          category: "TECHNICAL",
          body: "y",
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(429);
      expect(body.error.code).toBe("rate_limited");
    });

    it("rejects invalid payloads with 400", async () => {
      const res = await buildApp().request("/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: "" }), // missing category + body
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /", () => {
    it("scopes the list to the current user", async () => {
      mockDb.ticket.findMany.mockResolvedValueOnce([sampleTicket]);
      mockDb.ticket.count.mockImplementation(async (args: any) => {
        if (args?.where?.userId === "user_test_1") return 1;
        return 0;
      });
      const res = await buildApp().request("/");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.total).toBe(1);
      expect(mockDb.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "user_test_1" }),
        }),
      );
    });

    it("filters by status and priority", async () => {
      mockDb.ticket.findMany.mockResolvedValueOnce([]);
      mockDb.ticket.count.mockResolvedValueOnce(0);
      const res = await buildApp().request("/?status=OPEN&priority=HIGH&limit=500");
      expect(res.status).toBe(200);
      expect(mockDb.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "OPEN",
            priority: "HIGH",
            userId: "user_test_1",
          }),
          take: 500,
        }),
      );
    });
  });

  describe("GET /:id", () => {
    it("returns the ticket with its messages", async () => {
      mockDb.ticket.findUnique.mockResolvedValueOnce({
        ...sampleTicket,
        user: { id: "user_test_1", email: "t@a.com", name: "Test" },
        assignedTo: null,
        messages: [{ id: "m_1", body: "help" }],
      });
      const res = await buildApp().request("/tk_1");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.id).toBe("tk_1");
      expect(body.data.messages).toHaveLength(1);
    });

    it("returns 404 when the ticket does not exist", async () => {
      mockDb.ticket.findUnique.mockResolvedValueOnce(null);
      const res = await buildApp().request("/missing");
      expect(res.status).toBe(404);
    });

    it("returns 403 when the ticket belongs to another user", async () => {
      mockDb.ticket.findUnique.mockResolvedValueOnce({ ...sampleTicket, userId: "someone_else" });
      const res = await buildApp().request("/tk_1");
      expect(res.status).toBe(403);
    });
  });

  describe("POST /:id/messages", () => {
    it("appends a user reply and flips status to PENDING", async () => {
      mockDb.ticket.findUnique.mockResolvedValueOnce({
        ...sampleTicket,
        user: { id: "user_test_1", email: "t@a.com", name: "Test" },
      });
      const createdMsg = { id: "m_2", body: "still broken" };
      // The route uses a transaction with [create, update]; we simulate both.
      mockDb.$transaction.mockResolvedValueOnce([createdMsg, { status: "PENDING" }]);
      mockDb.user.findMany.mockResolvedValueOnce([]); // no admins

      const res = await buildApp().request("/tk_1/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "still broken" }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.data.id).toBe("m_2");
      // Verify the update sets status to PENDING (user reply)
      // The transaction arg is an array of [PrismaPromise, ...]. Each
      // element is a vi.fn() result (the mock for db.x.create/update), so
      // we look at the call args on the underlying ticket.update mock.
      expect(mockDb.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PENDING" }),
        }),
      );
    });

    it("rejects replies to a closed ticket with 409", async () => {
      mockDb.ticket.findUnique.mockResolvedValueOnce({
        ...sampleTicket,
        status: "CLOSED",
        user: { id: "user_test_1", email: "t@a.com", name: "Test" },
      });
      const res = await buildApp().request("/tk_1/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "still broken" }),
      });
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.error.code).toBe("ticket_closed");
    });

    it("returns 429 when reply rate limit is exceeded", async () => {
      mockRateLimit.checkRateLimit.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfterMs: 60_000,
      });
      const res = await buildApp().request("/tk_1/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "spam" }),
      });
      expect(res.status).toBe(429);
    });
  });

  describe("POST /:id/close", () => {
    it("closes the ticket and records an audit entry", async () => {
      mockDb.ticket.findUnique.mockResolvedValueOnce(sampleTicket);
      mockDb.ticket.update.mockResolvedValueOnce({ ...sampleTicket, status: "CLOSED" });
      const res = await buildApp().request("/tk_1/close", { method: "POST" });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.status).toBe("CLOSED");
      expect(mockRecordAudit.recordAudit).toHaveBeenCalled();
    });

    it("returns 403 when the user doesn't own the ticket", async () => {
      mockDb.ticket.findUnique.mockResolvedValueOnce({ ...sampleTicket, userId: "other" });
      const res = await buildApp().request("/tk_1/close", { method: "POST" });
      expect(res.status).toBe(403);
    });
  });

  describe("POST /:id/status (admin only)", () => {
    it("returns 403 for non-admins", async () => {
      const res = await buildApp().request("/tk_1/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      expect(res.status).toBe(403);
    });

    it("updates the status when called by an admin", async () => {
      mockDb.ticket.findUnique.mockResolvedValueOnce(sampleTicket);
      mockDb.ticket.update.mockResolvedValueOnce({ ...sampleTicket, status: "RESOLVED" });
      const res = await buildApp({ admin: true }).request("/tk_1/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.status).toBe("RESOLVED");
      expect(mockRecordAudit.recordAudit).toHaveBeenCalled();
    });

    it("returns 404 when the ticket is missing", async () => {
      mockDb.ticket.findUnique.mockResolvedValueOnce(null);
      const res = await buildApp({ admin: true }).request("/tk_1/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /:id/assign (admin only)", () => {
    it("returns 403 for non-admins", async () => {
      const res = await buildApp().request("/tk_1/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignedToId: "user_admin_1" }),
      });
      expect(res.status).toBe(403);
    });

    it("rejects non-admin assignees", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({ id: "user_x", role: "USER" });
      const res = await buildApp({ admin: true }).request("/tk_1/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignedToId: "user_x" }),
      });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.code).toBe("not_an_admin");
    });

    it("assigns the ticket to a valid admin", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({ id: "user_admin_2", role: "ADMIN" });
      mockDb.ticket.findUnique.mockResolvedValueOnce(sampleTicket);
      mockDb.ticket.update.mockResolvedValueOnce({ ...sampleTicket, assignedToId: "user_admin_2" });
      const res = await buildApp({ admin: true }).request("/tk_1/assign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignedToId: "user_admin_2" }),
      });
      expect(res.status).toBe(200);
      expect(mockRecordAudit.recordAudit).toHaveBeenCalled();
    });
  });
});
