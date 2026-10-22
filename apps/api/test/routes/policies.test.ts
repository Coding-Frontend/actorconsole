import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for /policies/* — public policy read + authenticated acceptance.
 *
 * Covers:
 *   - GET /:slug (public)
 *   - GET /:slug/versions (public)
 *   - POST /:slug/accept (auth)
 *   - GET /me/acceptance (auth)
 */

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    policy: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    policyAcceptance: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@actorconsole/db", () => ({ db: mockDb }));

vi.mock("../../src/middleware/auth", () => ({
  requireAuth: () => async (c: any, next: any) => {
    c.set("session", { userId: "user_test_1", email: "t@a.com", plan: "FREE" });
    await next();
  },
}));

// Stub recordAudit so the import doesn't require a full admin context.
vi.mock("../../src/routes/admin.js", () => ({
  recordAudit: vi.fn(),
}));

import { policyRoutes } from "../../src/routes/policies.js";

function buildApp() {
  const app = new Hono();
  app.route("/", policyRoutes);
  return app;
}

const samplePolicy = {
  id: "pol_1",
  slug: "TERMS",
  title: "Terms of Service",
  body: "These are the terms...",
  version: "1.0.0",
  status: "PUBLISHED",
  publishedAt: "2026-06-01T00:00:00.000Z",
};

describe("policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /:slug (public)", () => {
    it("returns the most recent published version", async () => {
      mockDb.policy.findFirst.mockResolvedValueOnce(samplePolicy);
      const res = await buildApp().request("/TERMS");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({
        slug: "TERMS",
        title: "Terms of Service",
        version: "1.0.0",
      });
      expect(mockDb.policy.findFirst).toHaveBeenCalledWith({
        where: { slug: "TERMS", status: "PUBLISHED", deletedAt: null },
        orderBy: { publishedAt: "desc" },
      });
    });

    it("returns 404 when no published policy exists", async () => {
      mockDb.policy.findFirst.mockResolvedValueOnce(null);
      const res = await buildApp().request("/TERMS");
      const body = await res.json();
      expect(res.status).toBe(404);
      expect(body.error.code).toBe("not_found");
    });

    it("rejects invalid slugs with a validation error", async () => {
      const res = await buildApp().request("/NOT-A-REAL-SLUG");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /:slug/versions (public)", () => {
    it("returns version history, newest first", async () => {
      mockDb.policy.findMany.mockResolvedValueOnce([
        { version: "1.1.0", title: "Terms v1.1", publishedAt: "2026-07-01T00:00:00.000Z" },
        { version: "1.0.0", title: "Terms v1.0", publishedAt: "2026-06-01T00:00:00.000Z" },
      ]);
      const res = await buildApp().request("/TERMS/versions");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].version).toBe("1.1.0");
      expect(mockDb.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: "TERMS", status: "PUBLISHED", deletedAt: null },
          orderBy: { publishedAt: "desc" },
        }),
      );
    });

    it("returns an empty list when no versions are published", async () => {
      mockDb.policy.findMany.mockResolvedValueOnce([]);
      const res = await buildApp().request("/PRIVACY/versions");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
    });
  });

  describe("POST /:slug/accept (auth)", () => {
    it("records acceptance and updates the user in a transaction", async () => {
      mockDb.policy.findUnique.mockResolvedValueOnce(samplePolicy);
      mockDb.$transaction.mockResolvedValueOnce([]);

      const res = await buildApp().request("/TERMS/accept", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
        body: JSON.stringify({ version: "1.0.0" }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual({ accepted: true, slug: "TERMS", version: "1.0.0" });

      // Transaction was called with create + update
      const txArgs = mockDb.$transaction.mock.calls[0][0];
      expect(txArgs).toHaveLength(2);
      expect(mockDb.policy.findUnique).toHaveBeenCalledWith({
        where: { slug_version: { slug: "TERMS", version: "1.0.0" } },
      });
    });

    it("returns 404 when the version is not published", async () => {
      mockDb.policy.findUnique.mockResolvedValueOnce({
        ...samplePolicy,
        status: "DRAFT",
      });
      const res = await buildApp().request("/TERMS/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "1.0.0" }),
      });
      const body = await res.json();
      expect(res.status).toBe(404);
      expect(body.error.code).toBe("not_published");
    });

    it("returns 404 when the policy version does not exist", async () => {
      mockDb.policy.findUnique.mockResolvedValueOnce(null);
      const res = await buildApp().request("/TERMS/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "9.9.9" }),
      });
      const body = await res.json();
      expect(res.status).toBe(404);
      expect(body.error.code).toBe("not_published");
    });
  });

  describe("GET /me/acceptance (auth)", () => {
    it("reports the user is up to date when both versions match", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({
        termsAcceptedAt: "2026-06-01T00:00:00.000Z",
        termsVersion: "1.0.0",
        privacyAcceptedAt: "2026-06-01T00:00:00.000Z",
        privacyVersion: "1.0.0",
      });
      mockDb.policy.findFirst
        .mockResolvedValueOnce({ ...samplePolicy, slug: "TERMS", version: "1.0.0" })
        .mockResolvedValueOnce({ ...samplePolicy, slug: "PRIVACY", version: "1.0.0" });

      const res = await buildApp().request("/me/acceptance");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.needsAcceptance).toBe(false);
      expect(body.data.currentTermsVersion).toBe("1.0.0");
      expect(body.data.currentPrivacyVersion).toBe("1.0.0");
    });

    it("flags needsAcceptance when terms version is stale", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({
        termsAcceptedAt: "2026-06-01T00:00:00.000Z",
        termsVersion: "1.0.0",
        privacyAcceptedAt: "2026-06-01T00:00:00.000Z",
        privacyVersion: "1.0.0",
      });
      mockDb.policy.findFirst
        .mockResolvedValueOnce({ ...samplePolicy, slug: "TERMS", version: "1.1.0" }) // newer
        .mockResolvedValueOnce({ ...samplePolicy, slug: "PRIVACY", version: "1.0.0" });

      const res = await buildApp().request("/me/acceptance");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.needsAcceptance).toBe(true);
      expect(body.data.currentTermsVersion).toBe("1.1.0");
    });

    it("does not require acceptance when no gating policy is published", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({
        termsAcceptedAt: null,
        termsVersion: null,
        privacyAcceptedAt: null,
        privacyVersion: null,
      });
      mockDb.policy.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const res = await buildApp().request("/me/acceptance");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.needsTermsAcceptance).toBe(false);
      expect(body.data.needsPrivacyAcceptance).toBe(false);
      expect(body.data.needsAcceptance).toBe(false);
      expect(res.headers.get("cache-control")).toContain("no-store");
    });

    it("returns 404 when the user is missing", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce(null);
      const res = await buildApp().request("/me/acceptance");
      expect(res.status).toBe(404);
    });
  });
});
