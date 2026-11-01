import { Hono } from "hono";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockSendEmail = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock("@actorconsole/db", () => ({
  db: {
    newsletterSubscriber: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

vi.mock("../../src/lib/rate-limit.js", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../src/middleware/auth.js", () => ({
  requireAuth: () => async (c: any, next: any) => {
    c.set("session", { userId: "u1", email: "test@test.com", plan: "FREE" });
    await next();
  },
}));

vi.mock("../../src/lib/email.js", () => ({ sendEmail: (...args: unknown[]) => mockSendEmail(...args), escapeHtml: (value: string) => value }));
vi.mock("@actorconsole/shared", async (original) => ({
  ...await original<typeof import("@actorconsole/shared")>(),
  getAppBaseUrl: () => "https://app.example.test",
  getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { newsletterRoutes } from "../../src/routes/newsletter.js";

function buildApp() {
  const app = new Hono();
  app.use("*", async (c: any, next: any) => {
    c.set("session", { userId: "u1", email: "test@test.com", plan: "FREE" });
    await next();
  });
  app.route("/newsletter", newsletterRoutes);
  return app;
}

describe("Newsletter routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockSendEmail.mockResolvedValue({ ok: true });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /newsletter/subscribe", () => {
    it("creates a pending subscriber and delivers an expiring mailbox confirmation", async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      mockCreate.mockResolvedValueOnce({ id: "n1", email: "user@example.com", status: "ACTIVE" });

      const res = await buildApp().request("/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      const data = mockCreate.mock.calls[0][0].data;
      expect(data.status).toBe("PENDING");
      const token = /token=([a-f0-9]{64})/.exec(mockSendEmail.mock.calls[0][0].html)![1];
      expect(data.confirmationTokenHash).toBe(createHash("sha256").update(token).digest("hex"));
      expect(data.confirmationExpiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(data.confirmationTokenHash).not.toBe(token);
    });

    it("returns success if already subscribed", async () => {
      mockFindUnique.mockResolvedValueOnce({
        id: "n1",
        status: "ACTIVE",
        email: "user@example.com",
      });

      const res = await buildApp().request("/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.message).toContain("Check your inbox");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("keeps an unsubscribed recipient opted out until mailbox confirmation", async () => {
      mockFindUnique.mockResolvedValueOnce({
        id: "n1",
        status: "UNSUBSCRIBED",
        email: "user@example.com",
      });
      mockUpdate.mockResolvedValueOnce({});

      const res = await buildApp().request("/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.message).toContain("Check your inbox");
      expect(mockUpdateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "n1" }), data: {
        confirmationTokenHash: expect.any(String), confirmationExpiresAt: expect.any(Date),
      } });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("rejects invalid email", async () => {
      const res = await buildApp().request("/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 429 when rate limited", async () => {
      mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });
      const res = await buildApp().request("/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
      expect(res.status).toBe(429);
    });
  });

  describe("mailbox confirmation", () => {
    const token = "a".repeat(64);
    it("does not activate subscriptions on a link-preview GET", async () => {
      const response = await buildApp().request(`/newsletter/confirm?token=${token}`);
      expect(response.status).toBe(200);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
    it("atomically redeems an address-bound, unexpired token exactly once", async () => {
      mockUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      const confirm = () => buildApp().request(`/newsletter/confirm?token=${token}`, { method: "POST" });
      expect((await confirm()).status).toBe(200);
      expect((await confirm()).status).toBe(400);
      expect(mockUpdateMany).toHaveBeenCalledWith({ where: {
        confirmationTokenHash: createHash("sha256").update(token).digest("hex"),
        confirmationExpiresAt: { gt: expect.any(Date) }, status: { in: ["PENDING", "UNSUBSCRIBED"] },
      }, data: expect.objectContaining({ status: "ACTIVE", confirmationTokenHash: null, confirmationExpiresAt: null }) });
    });
    it("rejects expired or unknown confirmations without activating anything", async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });
      expect((await buildApp().request(`/newsletter/confirm?token=${token}`, { method: "POST" })).status).toBe(400);
    });
  });

  describe("GET /newsletter/unsubscribe", () => {
    it("unsubscribes with valid token", async () => {
      mockFindUnique.mockResolvedValueOnce({ id: "n1", status: "ACTIVE" });
      mockUpdate.mockResolvedValueOnce({});

      const res = await buildApp().request("/newsletter/unsubscribe?token=valid-token");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("returns 400 when token is missing", async () => {
      const res = await buildApp().request("/newsletter/unsubscribe");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("missing_token");
    });

    it("returns 404 when token is invalid", async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      const res = await buildApp().request("/newsletter/unsubscribe?token=bad-token");
      expect(res.status).toBe(404);
    });

    it("returns success if already unsubscribed", async () => {
      mockFindUnique.mockResolvedValueOnce({ id: "n1", status: "UNSUBSCRIBED" });
      const res = await buildApp().request("/newsletter/unsubscribe?token=old-token");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  describe("POST /newsletter/unsubscribe", () => {
    it("unsubscribes the authenticated user", async () => {
      mockFindUnique.mockResolvedValueOnce({ id: "n1", status: "ACTIVE", email: "test@test.com" });
      mockUpdate.mockResolvedValueOnce({});

      const res = await buildApp().request("/newsletter/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("returns 404 if user is not subscribed", async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      const res = await buildApp().request("/newsletter/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(404);
    });
  });
});
