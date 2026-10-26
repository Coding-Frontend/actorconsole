import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";
import { encrypt, hashRecoveryCode, totpCode } from "@actorconsole/shared";

/**
 * Tests for /account/* — profile, sessions, api-keys, export, delete.
 *
 * These cover the most-used account management flows. The full
 * surface is large; we test the happy paths and the security-
 * critical edge cases (rate limit, account anonymisation).
 */

const { mockDb, mockRateLimit, mockTrackEvent, mockSession, mockGetApifyAccountIdentity } =
  vi.hoisted(() => ({
    mockSession: {
      userId: "user_test_1",
      email: "t@a.com",
      plan: "PRO",
      businessProfileId: undefined as string | undefined,
    },
    mockDb: {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      session: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      apiKey: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      onboardingState: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      businessProfile: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
      apifyToken: { findUnique: vi.fn() },
      actor: { findMany: vi.fn(), count: vi.fn() },
      bulkPublishSchedule: { findMany: vi.fn(), count: vi.fn() },
      subscription: { findMany: vi.fn() },
      payment: { findMany: vi.fn(), count: vi.fn() },
      notification: { findMany: vi.fn(), count: vi.fn() },
      ticket: { findMany: vi.fn() },
      githubInstallation: { findMany: vi.fn() },
      githubToken: { findMany: vi.fn() },
      notificationPreference: { findUnique: vi.fn(), findMany: vi.fn() },
      loginEvent: { findMany: vi.fn() },
      policyAcceptance: { findMany: vi.fn() },
      keywordWatch: { findMany: vi.fn() },
      keywordSearch: { findMany: vi.fn() },
      usageRecord: { findMany: vi.fn() },
      billingAddress: { findUnique: vi.fn() },
      newsletterSubscriber: { findMany: vi.fn() },
      auditLog: { findMany: vi.fn(), create: vi.fn() },
    },
    mockRateLimit: { checkRateLimit: vi.fn() },
    mockTrackEvent: { trackEvent: vi.fn() },
    mockGetApifyAccountIdentity: vi.fn(),
  }));

mockRateLimit.checkRateLimit.mockResolvedValue({
  allowed: true,
  remaining: 1,
  retryAfterMs: 0,
});

vi.mock("@actorconsole/db", () => ({ db: mockDb }));

vi.mock("@actorconsole/apify", () => ({
  getApifyAccountIdentity: (...args: unknown[]) => mockGetApifyAccountIdentity(...args),
  ApifyClientError: class ApifyClientError extends Error {
    status?: number;
    constructor(message: string, options?: { status?: number }) {
      super(message);
      this.name = "ApifyClientError";
      this.status = options?.status;
    }
  },
}));

vi.mock("../../src/middleware/auth.js", () => ({
  requireAuth: () => async (c: any, next: any) => {
    c.set("session", { ...mockSession });
    await next();
  },
}));

vi.mock("../../src/lib/rate-limit.js", () => mockRateLimit);

vi.mock("../../src/lib/analytics.js", () => mockTrackEvent);

import { accountRoutes } from "../../src/routes/account.js";

function buildApp() {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.route("/", accountRoutes);
  return app;
}

describe("account", () => {
  describe("two-factor credential races", () => {
    const passphrase = "local-account-two-factor-fixture";
    const secret = "JBSWY3DPEHPK3PXP";
    const recoveryCode = "ABCDE-12345";
    let state: { totpEnabled: boolean; totpSecretEncrypted: string; totpRecoveryCodes: string[] };

    beforeEach(() => {
      vi.stubEnv("APP_ENCRYPTION_KEY", passphrase);
      state = {
        totpEnabled: true,
        totpSecretEncrypted: encrypt(secret, passphrase, `totp:${mockSession.userId}`),
        totpRecoveryCodes: [hashRecoveryCode(recoveryCode, mockSession.userId, passphrase)],
      };
      mockDb.user.findUnique.mockImplementation(async () => structuredClone(state));
      mockDb.user.update.mockImplementation(async ({ data }) => {
        Object.assign(state, data);
        return structuredClone(state);
      });
      mockDb.user.updateMany.mockImplementation(async ({ where, data }) => {
        if (where.totpEnabled !== state.totpEnabled ||
          (where.totpSecretEncrypted !== undefined && where.totpSecretEncrypted !== state.totpSecretEncrypted) ||
          (where.totpRecoveryCodes && JSON.stringify(where.totpRecoveryCodes.equals) !== JSON.stringify(state.totpRecoveryCodes))) {
          return { count: 0 };
        }
        Object.assign(state, data);
        return { count: 1 };
      });
    });
    afterEach(() => vi.unstubAllEnvs());

    function factorRequest(path: string, code = recoveryCode) {
      return buildApp().request(path, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }),
      });
    }

    it("consumes a recovery code once across concurrent recovery-code regeneration requests", async () => {
      const responses = await Promise.all([
        factorRequest("/2fa/recovery-codes"), factorRequest("/2fa/recovery-codes"),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
      const successful = await responses.find((response) => response.status === 200)!.json();
      expect(state.totpRecoveryCodes).toEqual(successful.data.recoveryCodes.map((code: string) =>
        hashRecoveryCode(code, mockSession.userId, passphrase),
      ));
    });

    it("does not overwrite a factor enabled while a setup request was in flight", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({ totpEnabled: false });
      const before = structuredClone(state);
      const response = await buildApp().request("/2fa/setup", { method: "POST" });
      expect(response.status).toBe(409);
      expect(state).toEqual(before);
    });

    it("does not confirm a pending factor replaced while confirmation was in flight", async () => {
      state.totpEnabled = false;
      const oldPending = structuredClone(state);
      mockDb.user.findUnique.mockImplementationOnce(async () => {
        state.totpSecretEncrypted = "replacement-pending-secret";
        return oldPending;
      });
      const response = await factorRequest("/2fa/confirm", totpCode(secret));
      expect(response.status).toBe(409);
      expect(state.totpEnabled).toBe(false);
      expect(state.totpSecretEncrypted).toBe("replacement-pending-secret");
    });

    it("confirms the current pending factor and returns usable recovery codes", async () => {
      state.totpEnabled = false;
      const response = await factorRequest("/2fa/confirm", totpCode(secret));
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(state.totpEnabled).toBe(true);
      expect(data.recoveryCodes).toHaveLength(8);
      expect(state.totpRecoveryCodes).toEqual(data.recoveryCodes.map((code: string) =>
        hashRecoveryCode(code, mockSession.userId, passphrase),
      ));
    });

    it.each(["disable", "recovery-codes"])("does not apply %s to a factor replaced after verification", async (action) => {
      mockDb.user.findUnique.mockImplementationOnce(async () => {
        const loaded = structuredClone(state);
        state.totpSecretEncrypted = "newly-confirmed-factor";
        return loaded;
      });
      const response = await factorRequest(`/2fa/${action}`, totpCode(secret));
      expect(response.status).toBe(409);
      expect(state.totpEnabled).toBe(true);
      expect(state.totpSecretEncrypted).toBe("newly-confirmed-factor");
    });
  });
  describe("workspace access and MCP scope discovery", () => {
    it("returns unrestricted setup before a workspace exists", async () => {
      const response = await buildApp().request("/workspace-access");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await response.json()).data).toEqual({
        workspaceId: null,
        plan: "PRO",
        restricted: false,
        usage: null,
      });
    });
    it("reports the selected workspace's plan and usage", async () => {
      mockSession.businessProfileId = "w1";
      mockDb.businessProfile.findFirst.mockResolvedValue({
        plan: "FREE",
        apifyActorCount: 51,
        apifyMonthlyUsers: 100,
        planUsageCheckedAt: new Date(),
      });
      const response = await buildApp().request("/workspace-access");
      expect(response.status).toBe(200);
      expect((await response.json()).data).toMatchObject({
        workspaceId: "w1",
        plan: "FREE",
        restricted: true,
        usage: { actorCount: 51, upgradeRequired: true },
      });
      expect(mockDb.businessProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "w1", userId: "user_test_1" } }),
      );
    });
    it("limits scope discovery to actor identifiers owned by the selected workspace", async () => {
      mockSession.businessProfileId = "w1";
      mockDb.actor.findMany.mockResolvedValue([
        { apifyActorId: "a1", title: "Scraper", actorName: "scraper", username: "builder" },
      ]);
      mockDb.actor.count.mockResolvedValue(501);
      const response = await buildApp().request("/api-key-actors?page=2&limit=500");
      expect(response.status).toBe(200);
      expect(mockDb.actor.findMany).toHaveBeenCalledWith({
        where: { userId: "user_test_1", businessProfileId: "w1", apifyRemovedAt: null },
        select: { apifyActorId: true, title: true, actorName: true, username: true },
        orderBy: { id: "asc" },
        skip: 500,
        take: 500,
      });
      expect((await response.json()).data).toMatchObject({ total: 501, page: 2, limit: 500 });
    });
    it("requires a workspace for scope discovery", async () => {
      expect((await buildApp().request("/api-key-actors")).status).toBe(409);
      expect(mockDb.actor.findMany).not.toHaveBeenCalled();
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.businessProfileId = undefined;
    // Re-establish default mock for shared rate-limit + analytics mocks.
    mockRateLimit.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 1,
      retryAfterMs: 0,
    });
    mockDb.apiKey.count.mockResolvedValue(0);
    mockDb.auditLog.create.mockResolvedValue({});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /onboarding/apify-preview", () => {
    it("returns the non-secret Apify identity without creating a workspace", async () => {
      mockGetApifyAccountIdentity.mockResolvedValueOnce({
        id: "apify-account-1",
        username: "search-team",
        name: "Search Team",
        displayName: "Search Team",
        url: "https://apify.com/search-team",
      });

      const token = "a".repeat(30);
      const res = await buildApp().request("/onboarding/apify-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        ok: true,
        data: {
          id: "apify-account-1",
          username: "search-team",
          name: "Search Team",
          displayName: "Search Team",
          url: "https://apify.com/search-team",
        },
      });
      expect(mockGetApifyAccountIdentity).toHaveBeenCalledWith(token);
      expect(mockDb.businessProfile.create).not.toHaveBeenCalled();
    });

    it("rejects an invalid API key preview", async () => {
      mockGetApifyAccountIdentity.mockRejectedValueOnce(new Error("Apify rejected the API key"));

      const res = await buildApp().request("/onboarding/apify-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "a".repeat(30) }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body).toMatchObject({
        ok: false,
        error: {
          code: "apify_identity_preview_failed",
          message: "Could not verify the Apify API key. Check the key and try again.",
        },
      });
    });

    it("rejects a malformed API key before calling Apify", async () => {
      const res = await buildApp().request("/onboarding/apify-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "short" }),
      });

      expect(res.status).toBe(400);
      expect(mockGetApifyAccountIdentity).not.toHaveBeenCalled();
    });
  });

  describe("GET /profile", () => {
    it("returns the current user profile", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({
        id: "user_test_1",
        name: "Test",
        email: "t@a.com",
        plan: "FREE",
      });
      const res = await buildApp().request("/profile");
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toMatchObject({ id: "user_test_1", plan: "PRO" });
      expect(mockDb.user.findUnique.mock.calls[0][0].where.id).toBe("user_test_1");
    });
  });

  describe("PATCH /profile", () => {
    it("updates profile fields without completing workspace onboarding", async () => {
      mockDb.user.update.mockResolvedValueOnce({ id: "user_test_1", name: "New" });
      const res = await buildApp().request("/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New", bio: "Hello" }),
      });
      expect(res.status).toBe(200);
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: "user_test_1" },
        data: { name: "New", bio: "Hello" },
        select: expect.objectContaining({ id: true }),
      });
      expect(mockDb.onboardingState.upsert).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /", () => {
    it("schedules deletion during the grace period and deletes all sessions", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({ email: "t@a.com" });
      mockDb.user.update.mockResolvedValueOnce({});
      mockDb.session.deleteMany.mockResolvedValueOnce({ count: 3 });
      const res = await buildApp().request("/", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      expect(res.status).toBe(200);
      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user_test_1" },
          data: expect.objectContaining({
            deletionRequestedAt: expect.any(Date),
            deletionScheduledFor: expect.any(Date),
            suspendedAt: expect.any(Date),
            bannedReason: "User requested deletion",
          }),
        }),
      );
      expect(mockDb.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user_test_1" },
      });
    });
  });

  describe("GET /export", () => {
    it("returns a JSON document with the user's data", async () => {
      mockDb.user.findUnique.mockResolvedValueOnce({ id: "user_test_1", email: "t@a.com" });
      mockDb.actor.findMany.mockResolvedValueOnce([]);
      mockDb.bulkPublishSchedule.findMany.mockResolvedValueOnce([]);
      mockDb.subscription.findMany.mockResolvedValueOnce([]);
      mockDb.payment.findMany.mockResolvedValueOnce([]);
      mockDb.notification.findMany.mockResolvedValueOnce([]);
      mockDb.ticket.findMany.mockResolvedValueOnce([]);
      mockDb.githubInstallation.findMany.mockResolvedValueOnce([]);
      mockDb.githubToken.findMany.mockResolvedValueOnce([]);
      mockDb.notificationPreference.findMany.mockResolvedValueOnce([]);
      mockDb.loginEvent.findMany.mockResolvedValueOnce([]);
      mockDb.onboardingState.findMany.mockResolvedValueOnce([]);
      mockDb.policyAcceptance.findMany.mockResolvedValueOnce([]);
      mockDb.keywordWatch.findMany.mockResolvedValueOnce([]);
      mockDb.keywordSearch.findMany.mockResolvedValueOnce([]);
      mockDb.usageRecord.findMany.mockResolvedValueOnce([]);
      mockDb.billingAddress.findUnique.mockResolvedValueOnce(null);
      mockDb.newsletterSubscriber.findMany.mockResolvedValueOnce([]);
      mockDb.auditLog.findMany.mockResolvedValueOnce([]);

      const res = await buildApp().request("/export");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json");
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename=/);
      const body = await res.json();
      expect(body).toMatchObject({
        user: { id: "user_test_1" },
        actors: [],
        publishingSchedules: [],
      });
      expect(typeof body.exportedAt).toBe("string");
    });
  });

  describe("GET /sessions", () => {
    it("returns the user's active sessions", async () => {
      mockDb.session.findMany.mockResolvedValueOnce([
        { id: "s_1", expires: new Date(Date.now() + 60_000) },
      ]);
      const res = await buildApp().request("/sessions");
      const body = await res.json();
      expect(body.data).toHaveLength(1);
    });
  });

  describe("onboarding", () => {
    it("starts with explicit workspace creation when no workspace exists", async () => {
      const res = await buildApp().request("/onboarding");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({
        workspace: null,
        currentStep: "workspace",
        credentials: {
          apiKeyConfigured: false,
          uiTokenConfigured: false,
          cookiesConfigured: false,
        },
      });
      expect(mockDb.onboardingState.findUnique).not.toHaveBeenCalled();
    });

    it("completes the optional credentials step for the active workspace", async () => {
      mockSession.businessProfileId = "workspace_1";
      mockDb.onboardingState.findUnique.mockResolvedValueOnce({
        credentialsStepCompletedAt: null,
        planStepCompletedAt: null,
        completedAt: null,
      });
      mockDb.onboardingState.upsert.mockImplementationOnce(async ({ create }) => ({
        userId: "user_test_1",
        ...create,
      }));

      const res = await buildApp().request("/onboarding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "credentials" }),
      });

      expect(res.status).toBe(200);
      expect(mockDb.onboardingState.upsert).toHaveBeenCalledWith({
        where: { businessProfileId: "workspace_1" },
        create: expect.objectContaining({
          userId: "user_test_1",
          businessProfileId: "workspace_1",
          profileComplete: true,
          credentialsStepCompletedAt: expect.any(Date),
        }),
        update: {
          credentialsStepCompletedAt: expect.any(Date),
          credentialMode: "LIMITED",
        },
      });
    });

    it("automatically skips plan selection for an existing Pro workspace", async () => {
      mockSession.businessProfileId = "workspace_1";
      const credentialsCompletedAt = new Date("2026-08-07T00:00:00.000Z");
      mockDb.onboardingState.findUnique.mockResolvedValueOnce({
        credentialsStepCompletedAt: credentialsCompletedAt,
        planStepCompletedAt: null,
        completedAt: null,
      });
      mockDb.onboardingState.update.mockResolvedValueOnce({
        credentialsStepCompletedAt: credentialsCompletedAt,
        planStepCompletedAt: new Date("2026-08-12T00:00:00.000Z"),
        completedAt: new Date("2026-08-12T00:00:00.000Z"),
        credentialMode: "LIMITED",
      });
      mockDb.businessProfile.findFirst.mockResolvedValueOnce({
        id: "workspace_1",
        name: "Pro workspace",
        slug: "pro-workspace",
        industry: null,
        website: null,
      });
      mockDb.apifyToken.findUnique.mockResolvedValueOnce(null);

      const res = await buildApp().request("/onboarding");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({ plan: "PRO", currentStep: "complete" });
      expect(mockDb.onboardingState.update).toHaveBeenCalledWith({
        where: { businessProfileId: "workspace_1" },
        data: {
          planStepCompletedAt: expect.any(Date),
          completedAt: expect.any(Date),
        },
      });
    });

    it("completes onboarding after the plan step", async () => {
      mockSession.businessProfileId = "workspace_1";
      mockDb.onboardingState.findUnique.mockResolvedValueOnce({
        credentialsStepCompletedAt: new Date("2026-08-07T00:00:00.000Z"),
        planStepCompletedAt: null,
        completedAt: null,
      });
      mockDb.onboardingState.upsert.mockImplementationOnce(async ({ create }) => ({
        ...create,
        planStepCompletedAt: new Date(),
        completedAt: new Date(),
      }));

      const res = await buildApp().request("/onboarding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "plan" }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.currentStep).toBe("complete");
      expect(mockDb.onboardingState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { businessProfileId: "workspace_1" },
          update: expect.objectContaining({
            planStepCompletedAt: expect.any(Date),
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("rejects client-authored integration state", async () => {
      const res = await buildApp().request("/onboarding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apifyConnected: true }),
      });
      expect(res.status).toBe(400);
      expect(mockDb.onboardingState.upsert).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /sessions/:id", () => {
    it("deletes a single session for the user", async () => {
      mockDb.session.deleteMany.mockResolvedValueOnce({ count: 1 });
      const res = await buildApp().request("/sessions/s_1", { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(mockDb.session.deleteMany).toHaveBeenCalledWith({
        where: { id: "s_1", userId: "user_test_1" },
      });
    });
  });

  describe("GET /navigation-status", () => {
    it("returns status counts for the active workspace", async () => {
      mockSession.businessProfileId = "workspace_1";
      mockDb.notification.count.mockResolvedValueOnce(4);
      mockDb.apifyToken.findUnique.mockResolvedValueOnce({
        encryptedToken: "encrypted",
        encryptedUiToken: null,
        encryptedCookies: null,
        apiTokenStatus: "INVALID",
        uiTokenStatus: "NOT_CONFIGURED",
        cookiesStatus: "NOT_CONFIGURED",
      });
      mockDb.apiKey.count.mockResolvedValueOnce(2);

      const res = await buildApp().request("/navigation-status");
      const body = await res.json();

      expect(body.data).toEqual({
        workspaceId: "workspace_1",
        unreadNotifications: 4,
        credentialIssue: true,
        expiredApiKeys: 2,
        plan: "PRO",
      });
      expect(mockDb.notification.count).toHaveBeenCalledWith({
        where: {
          userId: "user_test_1",
          businessProfileId: "workspace_1",
          readAt: null,
        },
      });
    });
  });

  describe("MCP credentials", () => {
    beforeEach(() => {
      mockSession.businessProfileId = "workspace_1";
    });

    it("GET /api-keys returns masked keys", async () => {
      mockDb.apiKey.findMany.mockResolvedValueOnce([
        { id: "k_1", name: "ci", keyPreview: "…7890", createdAt: new Date() },
      ]);
      mockDb.apiKey.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      const res = await buildApp().request("/api-keys?limit=500");
      const body = await res.json();
      expect(body.data.items[0].keyPreview).toBe("…7890");
      // keyHash itself should be replaced/removed (only preview is sent)
      expect(body.data.items[0].keyHash).toBeUndefined();
      expect(mockDb.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user_test_1", businessProfileId: "workspace_1" },
          skip: 0,
          take: 500,
        }),
      );
      expect(body.data).toMatchObject({ total: 1, page: 1, limit: 500, activeCount: 1 });
    });

    it("POST /api-keys creates an MCP-only credential and returns the raw secret once", async () => {
      mockDb.apiKey.create.mockResolvedValueOnce({
        id: "k_2",
        name: "ci",
      });
      const res = await buildApp().request("/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ci" }),
      });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(typeof body.data.key).toBe("string");
      expect(body.data.key).toMatch(/^al_[a-f0-9]+$/);
      // keyHash stored, not the raw key
      const stored = mockDb.apiKey.create.mock.calls[0][0].data;
      expect(stored.keyHash).not.toBe(body.data.key);
      expect(stored.keyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.keyPreview).toBe(`…${body.data.key.slice(-4)}`);
      expect(stored.businessProfileId).toBe("workspace_1");
      expect(stored.scopes).toEqual(
        expect.arrayContaining(["mcp", "workspace:read", "publishing:run"]),
      );
      expect(stored.scopes).not.toContain("read");
      expect(stored.scopes).not.toContain("write");
      expect(body.data.permissions).toEqual(
        expect.arrayContaining(["workspace:read", "actors:read", "publishing:run"]),
      );
    });

    it("ignores legacy caller-selected scopes when creating MCP credentials", async () => {
      mockDb.apiKey.create.mockResolvedValueOnce({ id: "k_3", name: "agent" });
      const res = await buildApp().request("/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "agent", scopes: ["read"] }),
      });

      expect(res.status).toBe(201);
      expect(mockDb.apiKey.create.mock.calls[0][0].data.scopes).toEqual(
        expect.arrayContaining(["mcp", "workspace:read", "publishing:run"]),
      );
      expect(mockDb.apiKey.create.mock.calls[0][0].data.scopes).not.toContain("read");
      expect(mockDb.apiKey.create.mock.calls[0][0].data.scopes).not.toContain("write");
    });

    it("rejects creation after the active-key cap is reached", async () => {
      mockDb.apiKey.count.mockResolvedValueOnce(20);
      const res = await buildApp().request("/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "one too many" }),
      });
      expect(res.status).toBe(409);
      expect(mockDb.apiKey.create).not.toHaveBeenCalled();
    });

    it("edits an active key without returning a new secret", async () => {
      mockDb.apiKey.findFirst.mockResolvedValueOnce({
        id: "k_1",
        userId: "user_test_1",
        businessProfileId: "workspace_1",
        revokedAt: null,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      });
      mockDb.apiKey.update.mockImplementationOnce(async ({ data }) => ({
        id: "k_1",
        name: data.name,
        actorIds: data.actorIds,
        scopes: ["read", "write", "mcp"],
        keyPreview: "…abcd",
        expiresAt: data.expiresAt ?? new Date("2027-01-01T00:00:00.000Z"),
      }));

      const res = await buildApp().request("/api-keys/k_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "edited", actorIds: [], expiresAt: null }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({
        id: "k_1",
        name: "edited",
        actorIds: [],
        scopes: ["read", "write", "mcp"],
      });
      expect(body.data.key).toBeUndefined();
      expect(mockDb.apiKey.update).toHaveBeenCalledWith({
        where: { id: "k_1" },
        data: { name: "edited", actorIds: [], expiresAt: null },
      });
    });

    it("rotates a workspace key and only returns the replacement secret once", async () => {
      mockDb.apiKey.findFirst.mockResolvedValueOnce({
        id: "k_1",
        userId: "user_test_1",
        businessProfileId: "workspace_1",
        revokedAt: null,
        expiresAt: null,
      });
      mockDb.apiKey.update.mockImplementationOnce(async ({ data }) => ({
        id: "k_1",
        ...data,
      }));

      const res = await buildApp().request("/api-keys/k_1/rotate", { method: "POST" });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.key).toMatch(/^al_[a-f0-9]{64}$/);
      expect(mockDb.apiKey.findFirst).toHaveBeenCalledWith({
        where: {
          id: "k_1",
          userId: "user_test_1",
          businessProfileId: "workspace_1",
          revokedAt: null,
        },
      });
      expect(mockDb.apiKey.update.mock.calls[0][0].data.keyHash).not.toBe(body.data.key);
    });

    it("revokes a key only inside the active workspace", async () => {
      mockDb.apiKey.updateMany.mockResolvedValueOnce({ count: 1 });

      const res = await buildApp().request("/api-keys/k_1", { method: "DELETE" });

      expect(res.status).toBe(200);
      expect(mockDb.apiKey.updateMany).toHaveBeenCalledWith({
        where: {
          id: "k_1",
          userId: "user_test_1",
          businessProfileId: "workspace_1",
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
