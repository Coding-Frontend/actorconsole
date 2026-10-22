import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for GET /announcements/active and POST /announcements/:id/dismiss.
 *
 * The route is split: GET /active is public (no auth), POST /:id/dismiss
 * requires a session. We mock @actorconsole/db so the real Prisma client
 * is never hit.
 */

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    announcement: { findFirst: vi.fn() },
    announcementDismissal: { findUnique: vi.fn(), upsert: vi.fn() },
    session: { findUnique: vi.fn() },
  },
}));

vi.mock("@actorconsole/db", () => ({ db: mockDb }));

// Mock requireAuth so the dismiss endpoint accepts a synthetic session.
vi.mock("../../src/middleware/auth.js", () => ({
  requireAuth: () => async (c: any, next: any) => {
    c.set("session", { userId: "user_test_1", email: "t@a.com", plan: "FREE" });
    await next();
  },
}));

import { announcementRoutes } from "../../src/routes/announcements.js";
import { MOCK_SESSION_TOKEN } from "../fixtures/hono-app.js";

function buildApp() {
  const app = new Hono();
  app.route("/", announcementRoutes);
  return app;
}

const sampleAnnouncement = {
  id: "ann_1",
  title: "Welcome to v2",
  body: "We've shipped the rewrite.",
  emoji: "🎉",
  linkUrl: "https://actorconsole.com/changelog",
  linkLabel: "Read the changelog",
  createdAt: new Date("2026-07-01T10:00:00Z"),
};

describe("announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /active", () => {
    it("returns null when no announcement exists", async () => {
      mockDb.announcement.findFirst.mockResolvedValueOnce(null);
      const res = await buildApp().request("/active");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, data: null });
    });

    it("returns the most recent announcement when unauthenticated", async () => {
      mockDb.announcement.findFirst.mockResolvedValueOnce(sampleAnnouncement);
      const res = await buildApp().request("/active");
      const body = await res.json();
      expect(body.data).toMatchObject({
        id: "ann_1",
        title: "Welcome to v2",
        emoji: "🎉",
        linkUrl: sampleAnnouncement.linkUrl,
      });
      // Should not call dismiss lookup without a session
      expect(mockDb.announcementDismissal.findUnique).not.toHaveBeenCalled();
    });

    it("hides the announcement when the user already dismissed it", async () => {
      mockDb.announcement.findFirst.mockResolvedValueOnce(sampleAnnouncement);
      // Provide a session cookie so the route tries to look up the user
      mockDb.session.findUnique.mockResolvedValueOnce({
        userId: "user_test_1",
        expires: new Date(Date.now() + 60_000),
      });
      mockDb.announcementDismissal.findUnique.mockResolvedValueOnce({
        userId: "user_test_1",
        announcementId: "ann_1",
      });
      const res = await buildApp().request("/active", {
        headers: { Cookie: `authjs.session-token=${MOCK_SESSION_TOKEN}` },
      });
      const body = await res.json();
      expect(body).toEqual({ ok: true, data: null });
    });

    it("ignores an expired session cookie and returns the announcement anyway", async () => {
      mockDb.announcement.findFirst.mockResolvedValueOnce(sampleAnnouncement);
      mockDb.session.findUnique.mockResolvedValueOnce({
        userId: "user_test_1",
        expires: new Date(Date.now() - 1000), // expired
      });
      const res = await buildApp().request("/active", {
        headers: { Cookie: `authjs.session-token=${MOCK_SESSION_TOKEN}` },
      });
      const body = await res.json();
      expect(body.data).toMatchObject({ id: "ann_1" });
      expect(mockDb.announcementDismissal.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("POST /:id/dismiss", () => {
    it("upserts a dismissal record for the current user", async () => {
      mockDb.announcementDismissal.upsert.mockResolvedValueOnce({});
      const res = await buildApp().request("/ann_1/dismiss", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(mockDb.announcementDismissal.upsert).toHaveBeenCalledWith({
        where: { userId_announcementId: { announcementId: "ann_1", userId: "user_test_1" } },
        create: { announcementId: "ann_1", userId: "user_test_1" },
        update: {},
      });
    });
  });
});
