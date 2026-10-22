import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock("@actorconsole/db", () => ({
  db: {
    newsletterSubscriber: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
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

vi.mock("@actorconsole/shared", () => ({
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /newsletter/subscribe", () => {
    it("creates a new subscriber", async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      mockCreate.mockResolvedValueOnce({ id: "n1", email: "user@example.com", status: "ACTIVE" });

      const res = await buildApp().request("/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(mockCreate).toHaveBeenCalled();
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
      expect(body.message).toContain("Already subscribed");
    });

    it("re-subscribes an unsubscribed user", async () => {
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
      expect(body.message).toContain("re-subscribed");
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
