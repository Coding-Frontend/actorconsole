import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { onErrorHandler } from "../../src/middleware/error.js";

// ─── Mocks (vi.hoisted so they're available inside vi.mock factories) ──────

const {
  mockSaveApifyToken,
  mockGetUserApifyClient,
  mockValidateUserApifyAccountMatch,
  mockRevokeApifyToken,
  mockTrackEvent,
  mockOnboardingUpsert,
  mockOnboardingUpdateMany,
  mockApifyTokenFindUnique,
  mockApifyTokenUpdateMany,
  mockExtensionSessionDeleteMany,
  mockExtensionSessionCreate,
  mockExtensionSessionFindUnique,
  mockExtensionSessionUpdateMany,
  mockExtensionDeviceFindUnique,
  mockBusinessProfileFindFirst,
  mockEnqueue,
} = vi.hoisted(() => ({
  mockSaveApifyToken: vi.fn(),
  mockGetUserApifyClient: vi.fn(),
  mockValidateUserApifyAccountMatch: vi.fn(),
  mockRevokeApifyToken: vi.fn(),
  mockTrackEvent: vi.fn(),
  mockOnboardingUpsert: vi.fn(),
  mockOnboardingUpdateMany: vi.fn(),
  mockApifyTokenFindUnique: vi.fn(),
  mockApifyTokenUpdateMany: vi.fn(),
  mockExtensionSessionDeleteMany: vi.fn(),
  mockExtensionSessionCreate: vi.fn(),
  mockExtensionSessionFindUnique: vi.fn(),
  mockExtensionSessionUpdateMany: vi.fn(),
  mockExtensionDeviceFindUnique: vi.fn(),
  mockBusinessProfileFindFirst: vi.fn(),
  mockEnqueue: vi.fn(),
}));

vi.mock("@actorconsole/apify", () => ({
  saveApifyToken: (...args: unknown[]) => mockSaveApifyToken(...args),
  getUserApifyClient: (...args: unknown[]) => mockGetUserApifyClient(...args),
  validateUserApifyAccountMatch: (...args: unknown[]) => mockValidateUserApifyAccountMatch(...args),
  revokeApifyToken: (...args: unknown[]) => mockRevokeApifyToken(...args),
  ApifyClientError: class ApifyClientError extends Error {
    code: string;
    status: number | null;
    constructor(code: string, msg: string, opts?: { status?: number | null }) {
      super(msg);
      this.name = "ApifyClientError";
      this.code = code;
      this.status = opts?.status ?? null;
    }
  },
}));

vi.mock("@actorconsole/db", () => ({
  db: {
    apifyToken: {
      findUnique: (...args: unknown[]) => mockApifyTokenFindUnique(...args),
      updateMany: (...args: unknown[]) => mockApifyTokenUpdateMany(...args),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    apifyExtensionSession: {
      deleteMany: (...args: unknown[]) => mockExtensionSessionDeleteMany(...args),
      create: (...args: unknown[]) => mockExtensionSessionCreate(...args),
      findUnique: (...args: unknown[]) => mockExtensionSessionFindUnique(...args),
      updateMany: (...args: unknown[]) => mockExtensionSessionUpdateMany(...args),
    },
    apifyExtensionDevice: {
      findUnique: (...args: unknown[]) => mockExtensionDeviceFindUnique(...args),
    },
    businessProfile: {
      findFirst: (...args: unknown[]) => mockBusinessProfileFindFirst(...args),
    },
    onboardingState: {
      upsert: (...args: unknown[]) => mockOnboardingUpsert(...args),
      updateMany: (...args: unknown[]) => mockOnboardingUpdateMany(...args),
    },
  },
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("../../src/lib/queue.js", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

import { apifyRoutes } from "../../src/routes/apify.js";
import { ApifyClientError } from "@actorconsole/apify";

function buildApp() {
  const app = new Hono();
  app.onError(onErrorHandler);
  // Inject session before the route runs (mirrors requireAuth from app.ts)
  app.use("*", async (c: any, next: any) => {
    c.set("session", {
      userId: "u1",
      email: "test@test.com",
      plan: "PRO",
      businessProfileId: "workspace_1",
    });
    await next();
  });
  app.route("/apify", apifyRoutes);
  return app;
}

/** Authenticated request (session injected via middleware above). */
function authRequest(path: string, init?: RequestInit): Promise<Response> {
  return buildApp().request(path, {
    ...init,
    headers: { ...init?.headers, cookie: "authjs.session-token=valid-token" },
  });
}

describe("Apify connection routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnboardingUpsert.mockResolvedValue({});
    mockOnboardingUpdateMany.mockResolvedValue({ count: 1 });
    mockApifyTokenUpdateMany.mockResolvedValue({ count: 1 });
    mockExtensionSessionDeleteMany.mockResolvedValue({ count: 0 });
    mockExtensionSessionUpdateMany.mockResolvedValue({ count: 1 });
    mockExtensionDeviceFindUnique.mockResolvedValue({
      id: "device_1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockBusinessProfileFindFirst.mockResolvedValue({ id: "workspace_1", name: "Primary" });
    mockEnqueue.mockResolvedValue("insight-bootstrap-job");
    mockValidateUserApifyAccountMatch.mockResolvedValue({ matches: true });
  });

  describe("Chrome extension handoff", () => {
    it("creates a five-minute session without storing the plaintext challenge", async () => {
      mockExtensionSessionCreate.mockImplementationOnce(async ({ data }: any) => {
        expect(data.challengeHash).toMatch(/^[a-f0-9]{64}$/);
        expect(data).not.toHaveProperty("challenge");
        return { id: "handoff_1" };
      });

      const before = Date.now();
      const res = await authRequest("/apify/extension/session", { method: "POST" });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({
        handoffId: "handoff_1",
        workspace: { id: "workspace_1", name: "Primary" },
      });
      expect(body.data.challenge.length).toBeGreaterThanOrEqual(32);
      expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThanOrEqual(
        before + 5 * 60 * 1_000 - 1_000,
      );
    });

    it("binds a handoff to the selected Apify organization", async () => {
      mockExtensionSessionCreate.mockImplementationOnce(async ({ data }: any) => {
        expect(data.apifyAccountId).toBe("organization123");
        expect(data.apifyAccountType).toBe("ORGANIZATION");
        return { id: "handoff_org" };
      });

      const res = await authRequest("/apify/extension/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apifyAccountId: "organization123", apifyAccountType: "ORGANIZATION" }),
      });

      expect(res.status).toBe(200);
      expect((await res.json()).data.account).toEqual({ id: "organization123", type: "ORGANIZATION" });
    });

    it("rejects an incomplete Apify account target", async () => {
      const res = await authRequest("/apify/extension/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apifyAccountId: "organization123" }),
      });

      expect(res.status).toBe(400);
      expect(mockExtensionSessionCreate).not.toHaveBeenCalled();
    });

    it("consumes a valid challenge and stores only the normalized ApifyRT credential", async () => {
      const challenge = "challenge-value-that-is-long-enough-123456789";
      mockExtensionSessionFindUnique.mockResolvedValueOnce({
        id: "handoff_1",
        userId: "u1",
        businessProfileId: "workspace_1",
        challengeHash: createHash("sha256").update(challenge).digest("hex"),
        deviceId: "device_1",
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });
      mockSaveApifyToken.mockResolvedValueOnce({
        apifyUserId: "apify-user-1",
        apifyUsername: "builder",
        apiKeyConfigured: true,
        uiTokenConfigured: false,
        cookiesConfigured: true,
        apiTokenStatus: "VALID",
        uiTokenStatus: "NOT_CONFIGURED",
        cookiesStatus: "VALID",
      });

      const res = await authRequest("/apify/extension/session/handoff_1/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge,
          apifyRt: "refresh-cookie-value",
          expectedApifyUserId: "aaaaaaaaaaaaaaaaa",
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(mockExtensionSessionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { consumedAt: expect.any(Date) } }),
      );
      expect(mockSaveApifyToken).toHaveBeenCalledWith(
        "u1",
        undefined,
        "workspace_1",
        undefined,
        "ApifyRT=refresh-cookie-value",
        "aaaaaaaaaaaaaaaaa",
        "aaaaaaaaaaaaaaaaa",
        "PERSONAL",
      );
      expect(body.data).toMatchObject({
        cookiesConfigured: true,
        cookiesStatus: "VALID",
        credentialMode: "FULL",
      });
      expect(JSON.stringify(body)).not.toContain("refresh-cookie-value");
    });

    it("completes a handoff for a selected organization", async () => {
      const challenge = "challenge-value-that-is-long-enough-123456789";
      mockExtensionSessionFindUnique.mockResolvedValueOnce({
        id: "handoff_org",
        userId: "u1",
        businessProfileId: "workspace_1",
        apifyAccountId: "organization123",
        apifyAccountType: "ORGANIZATION",
        challengeHash: createHash("sha256").update(challenge).digest("hex"),
        deviceId: "device_1",
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });
      mockSaveApifyToken.mockResolvedValueOnce({
        apifyUserId: "organization123",
        apifyUsername: "sample-org",
        accountType: "ORGANIZATION",
        apiKeyConfigured: false,
        uiTokenConfigured: false,
        cookiesConfigured: true,
      });

      const res = await authRequest("/apify/extension/session/handoff_org/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge,
          apifyRt: "refresh-cookie-value",
          expectedApifyUserId: "personalUser123",
        }),
      });

      expect(res.status).toBe(200);
      expect(mockSaveApifyToken).toHaveBeenCalledWith(
        "u1", undefined, "workspace_1", undefined,
        "ApifyRT=refresh-cookie-value", "personalUser123", "organization123", "ORGANIZATION",
      );
      expect((await res.json()).data).toMatchObject({
        apifyUserId: "organization123",
        accountType: "ORGANIZATION",
      });
    });

    it("rejects an expired handoff before touching the credential", async () => {
      mockExtensionSessionFindUnique.mockResolvedValueOnce({
        id: "handoff_1",
        userId: "u1",
        businessProfileId: "workspace_1",
        challengeHash: "0".repeat(64),
        expiresAt: new Date(Date.now() - 1_000),
        consumedAt: null,
      });

      const res = await authRequest("/apify/extension/session/handoff_1/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: "x".repeat(40),
          apifyRt: "cookie-value",
          expectedApifyUserId: "aaaaaaaaaaaaaaaaa",
        }),
      });

      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("apify_extension_session_expired");
      expect(mockExtensionSessionUpdateMany).not.toHaveBeenCalled();
      expect(mockSaveApifyToken).not.toHaveBeenCalled();
    });

    it("rejects a handoff that was already consumed", async () => {
      mockExtensionSessionFindUnique.mockResolvedValueOnce({
        id: "handoff_1",
        userId: "u1",
        businessProfileId: "workspace_1",
        challengeHash: "0".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
      });

      const res = await authRequest("/apify/extension/session/handoff_1/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: "x".repeat(40),
          apifyRt: "cookie-value",
          expectedApifyUserId: "aaaaaaaaaaaaaaaaa",
        }),
      });

      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("apify_extension_session_used");
      expect(mockExtensionSessionUpdateMany).not.toHaveBeenCalled();
      expect(mockSaveApifyToken).not.toHaveBeenCalled();
    });

    it("rejects an invalid challenge without claiming the handoff", async () => {
      mockExtensionSessionFindUnique.mockResolvedValueOnce({
        id: "handoff_1",
        userId: "u1",
        businessProfileId: "workspace_1",
        challengeHash: createHash("sha256").update("correct-challenge".repeat(3)).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });

      const res = await authRequest("/apify/extension/session/handoff_1/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: "wrong-challenge".repeat(3),
          apifyRt: "cookie-value",
          expectedApifyUserId: "aaaaaaaaaaaaaaaaa",
        }),
      });

      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("apify_extension_challenge_invalid");
      expect(mockExtensionSessionUpdateMany).not.toHaveBeenCalled();
      expect(mockSaveApifyToken).not.toHaveBeenCalled();
    });

    it("rejects a handoff from another workspace", async () => {
      mockExtensionSessionFindUnique.mockResolvedValueOnce({
        id: "handoff_1",
        userId: "u1",
        businessProfileId: "workspace_2",
        challengeHash: "0".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });

      const res = await authRequest("/apify/extension/session/handoff_1/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: "x".repeat(40),
          apifyRt: "cookie-value",
          expectedApifyUserId: "aaaaaaaaaaaaaaaaa",
        }),
      });

      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("apify_extension_session_not_found");
      expect(mockSaveApifyToken).not.toHaveBeenCalled();
    });

    it("returns a specific account-mismatch error without exposing the cookie", async () => {
      const challenge = "challenge-value-that-is-long-enough-123456789";
      mockExtensionSessionFindUnique.mockResolvedValueOnce({
        id: "handoff_1",
        userId: "u1",
        businessProfileId: "workspace_1",
        challengeHash: createHash("sha256").update(challenge).digest("hex"),
        deviceId: "device_1",
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });
      mockSaveApifyToken.mockRejectedValueOnce(
        new ApifyClientError("validation", "The Apify accounts do not match", { status: 409 }),
      );

      const res = await authRequest("/apify/extension/session/handoff_1/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge,
          apifyRt: "sensitive-cookie-value",
          expectedApifyUserId: "aaaaaaaaaaaaaaaaa",
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error.code).toBe("apify_extension_account_mismatch");
      expect(JSON.stringify(body)).not.toContain("sensitive-cookie-value");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /apify/connect", () => {
    it("connects with a valid API key and UI token", async () => {
      mockSaveApifyToken.mockResolvedValueOnce({
        apifyUserId: "user123",
        apiKeyConfigured: true,
        uiTokenConfigured: true,
        cookiesConfigured: false,
      });
      const apiToken = "a".repeat(30);
      const uiToken = "u".repeat(30);
      const res = await authRequest("/apify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: apiToken, uiToken }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.connected).toBe(true);
      expect(mockSaveApifyToken).toHaveBeenCalledWith(
        "u1",
        apiToken,
        "workspace_1",
        uiToken,
        undefined,
      );
      expect(mockOnboardingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { businessProfileId: "workspace_1" },
          update: expect.objectContaining({ apifyConnected: true }),
        }),
      );
      expect(mockEnqueue).toHaveBeenCalledWith("snapshots", {
        workspaceBootstrap: { userId: "u1", businessProfileId: "workspace_1" },
      });
      expect(body.data).toMatchObject({
        insightSyncQueued: true,
        insightSyncJobId: "insight-bootstrap-job",
      });
    });

    it("accepts cookies instead of a UI token", async () => {
      mockSaveApifyToken.mockResolvedValueOnce({
        apifyUserId: "user123",
        apiKeyConfigured: true,
        uiTokenConfigured: false,
        cookiesConfigured: true,
      });
      const apiToken = "a".repeat(30);
      const cookies = "apify-session=session-value";
      const res = await authRequest("/apify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: apiToken, cookies }),
      });

      expect(res.status).toBe(200);
      expect(mockSaveApifyToken).toHaveBeenCalledWith(
        "u1",
        apiToken,
        "workspace_1",
        undefined,
        cookies,
      );
    });

    it("rejects a UI key and cookies submitted together", async () => {
      const res = await authRequest("/apify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "a".repeat(30),
          uiToken: "u".repeat(30),
          cookies: "apify-session=session-value",
        }),
      });

      expect(res.status).toBe(400);
      expect(mockSaveApifyToken).not.toHaveBeenCalled();
    });

    it("accepts an API key without publishing credentials", async () => {
      mockSaveApifyToken.mockResolvedValueOnce({
        apifyUserId: "user123",
        apiKeyConfigured: true,
        uiTokenConfigured: false,
        cookiesConfigured: false,
      });
      const apiToken = "a".repeat(30);
      const res = await authRequest("/apify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: apiToken }),
      });

      expect(res.status).toBe(200);
      expect(mockSaveApifyToken).toHaveBeenCalledWith(
        "u1",
        apiToken,
        "workspace_1",
        undefined,
        undefined,
      );
    });

    it("accepts a UI token without an API key", async () => {
      mockSaveApifyToken.mockResolvedValueOnce({
        apifyUserId: null,
        apiKeyConfigured: false,
        uiTokenConfigured: true,
        cookiesConfigured: false,
      });
      const uiToken = "u".repeat(30);
      const res = await authRequest("/apify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiToken }),
      });

      expect(res.status).toBe(200);
      expect(mockSaveApifyToken).toHaveBeenCalledWith(
        "u1",
        undefined,
        "workspace_1",
        uiToken,
        undefined,
      );
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it("keeps a successful connection when the insight queue is unavailable", async () => {
      mockSaveApifyToken.mockResolvedValueOnce({
        apifyUserId: "user123",
        apiKeyConfigured: true,
        uiTokenConfigured: true,
        cookiesConfigured: false,
      });
      mockEnqueue.mockRejectedValueOnce(new Error("Redis unavailable"));
      const res = await authRequest("/apify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "a".repeat(30), uiToken: "u".repeat(30) }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).data.insightSyncQueued).toBe(false);
    });

    it("rejects an empty credentials payload", async () => {
      const res = await authRequest("/apify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(mockSaveApifyToken).not.toHaveBeenCalled();
    });

    it("rejects token shorter than 20 chars", async () => {
      const res = await authRequest("/apify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "short" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when saveApifyToken fails", async () => {
      mockSaveApifyToken.mockRejectedValueOnce(new Error("Invalid token"));
      const res = await authRequest("/apify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "a".repeat(30), uiToken: "u".repeat(30) }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("apify_connect_failed");
    });
  });

  describe("GET /apify/status", () => {
    it("returns persisted status without waiting for live Apify validation", async () => {
      const token = {
        id: "token-1",
        userId: "u1",
        businessProfileId: "workspace_1",
        apifyUserId: "apify-user",
        encryptedToken: "encrypted-api-key",
        encryptedUiToken: "encrypted-ui-token",
        encryptedCookies: null,
        apiTokenStatus: "EXPIRED",
        uiTokenStatus: "VALID",
        cookiesStatus: "NOT_CONFIGURED",
        validationError: "Apify API key was rejected or has expired. Update it to restore access.",
        validatedAt: new Date("2026-08-08T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      };
      mockApifyTokenFindUnique.mockResolvedValueOnce(token);

      const res = await authRequest("/apify/status");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({
        connected: true,
        apiKeyConfigured: true,
        uiTokenConfigured: true,
        apiTokenStatus: "EXPIRED",
      });
      expect(mockGetUserApifyClient).not.toHaveBeenCalled();
      expect(mockRevokeApifyToken).not.toHaveBeenCalled();
    });

    it("live-validates API and Console credentials independently when requested", async () => {
      const token = {
        id: "token-1",
        userId: "u1",
        businessProfileId: "workspace_1",
        apifyUserId: "apify-user",
        apifyUsername: "codingfrontend",
        encryptedToken: "encrypted-api-key",
        encryptedUiToken: "encrypted-ui-token",
        encryptedCookies: null,
        apiTokenStatus: "VALID",
        uiTokenStatus: "VALID",
        cookiesStatus: "NOT_CONFIGURED",
        validationError: null,
        validatedAt: new Date("2026-08-08T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      };
      mockApifyTokenFindUnique.mockResolvedValueOnce(token).mockResolvedValueOnce({
        ...token,
        apiTokenStatus: "EXPIRED",
        uiTokenStatus: "VALID",
        validationError: "Apify API key was rejected or has expired.",
      });
      mockGetUserApifyClient.mockResolvedValueOnce({
        validateApiAuthentication: vi.fn().mockRejectedValue(new Error("API key rejected")),
        validateConsoleAuthentication: vi.fn().mockResolvedValue(true),
      });

      const res = await authRequest("/apify/status?validate=true");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({
        connected: true,
        apiTokenStatus: "EXPIRED",
        uiTokenStatus: "VALID",
        error: expect.stringContaining("API key could not be validated"),
      });
      expect(body.data.error).not.toContain("Console credential");
    });
  });

  describe("GET /apify/operations", () => {
    it("returns independent API and Console section summaries", async () => {
      mockApifyTokenFindUnique.mockResolvedValueOnce({
        id: "token-1",
        userId: "u1",
        businessProfileId: "workspace_1",
        encryptedToken: "encrypted-api-key",
        encryptedUiToken: "encrypted-ui-token",
        encryptedCookies: null,
      });
      mockGetUserApifyClient.mockResolvedValueOnce({
        getResourceInventory: vi.fn().mockResolvedValue({
          actors: 863,
          runs: 4_200,
          datasets: 180,
          keyValueStores: 170,
          requestQueues: 92,
        }),
        listConsoleOrganizations: vi
          .fn()
          .mockResolvedValue([
            { id: "org-1", name: "Coding Frontned", isOwner: true, rolePermissions: [] },
          ]),
        listProxyUsageCycles: vi
          .fn()
          .mockResolvedValue([
            { startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-09-01T00:00:00.000Z" },
          ]),
        getCurrentBillingCycleServiceBreakdown: vi.fn().mockResolvedValue({
          COMPUTE_UNITS: [],
          PROXY_RESIDENTIAL_TRANSFER_GBYTES: [],
        }),
        listConsoleNotifications: vi.fn().mockResolvedValue([
          { _id: "n1", deliveryStatus: { ui: {} } },
          { _id: "n2", deliveryStatus: { ui: { readAt: "2026-08-12T00:00:00.000Z" } } },
        ]),
      });

      const res = await authRequest("/apify/operations");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toMatchObject({
        connected: true,
        api: {
          configured: true,
          available: true,
          inventory: { actors: 863, runs: 4_200, datasets: 180 },
        },
        console: {
          configured: true,
          available: true,
          sections: {
            organizations: { available: true, count: 1 },
            proxy: { available: true, billingCycles: 1 },
            billing: { available: true, serviceGroups: 2 },
            notifications: { available: true, total: 2, unread: 1 },
          },
        },
      });
    });

    it("keeps API inventory visible when Console authentication fails", async () => {
      mockApifyTokenFindUnique.mockResolvedValueOnce({
        id: "token-1",
        userId: "u1",
        businessProfileId: "workspace_1",
        encryptedToken: "encrypted-api-key",
        encryptedUiToken: null,
        encryptedCookies: "encrypted-cookies",
      });
      mockGetUserApifyClient.mockResolvedValueOnce({
        getResourceInventory: vi.fn().mockResolvedValue({ actors: 12, runs: 40 }),
        listConsoleOrganizations: vi.fn().mockRejectedValue(new Error("expired")),
        listProxyUsageCycles: vi.fn().mockRejectedValue(new Error("expired")),
        getCurrentBillingCycleServiceBreakdown: vi.fn().mockRejectedValue(new Error("expired")),
        listConsoleNotifications: vi.fn().mockRejectedValue(new Error("expired")),
      });

      const res = await authRequest("/apify/operations");
      const body = await res.json();

      expect(body.data.api).toMatchObject({ available: true, inventory: { actors: 12, runs: 40 } });
      expect(body.data.console).toMatchObject({
        configured: true,
        available: false,
        sections: {
          organizations: { available: false, count: null },
          notifications: { available: false, total: null, unread: null },
        },
      });
    });

    it("does not report API inventory as available when every resource failed", async () => {
      mockApifyTokenFindUnique.mockResolvedValueOnce({
        id: "token-1",
        userId: "u1",
        businessProfileId: "workspace_1",
        encryptedToken: "encrypted-api-key",
        encryptedUiToken: null,
        encryptedCookies: null,
      });
      mockGetUserApifyClient.mockResolvedValueOnce({
        getResourceInventory: vi.fn().mockResolvedValue({
          actors: null,
          runs: null,
          datasets: null,
          keyValueStores: null,
          requestQueues: null,
        }),
      });

      const res = await authRequest("/apify/operations");
      const body = await res.json();

      expect(body.data.api).toMatchObject({ configured: true, available: false });
    });
  });

  describe("DELETE /apify/disconnect", () => {
    it("disconnects successfully", async () => {
      mockRevokeApifyToken.mockResolvedValueOnce(undefined);
      const res = await authRequest("/apify/disconnect", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(mockRevokeApifyToken).toHaveBeenCalledWith("u1", "workspace_1");
      expect(mockOnboardingUpdateMany).toHaveBeenCalledWith({
        where: { userId: "u1", businessProfileId: "workspace_1" },
        data: { apifyConnected: false },
      });
    });
  });
});
