import { createHash } from "node:crypto";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const {
  mockDeviceFindUnique, mockHandoffFindUnique, mockHandoffUpdateMany,
  mockProfileFindFirst, mockTokenFindUnique, mockGetUserApifyClient, mockValidateUserApifyAccountMatch,
} = vi.hoisted(() => ({
  mockDeviceFindUnique: vi.fn(),
  mockHandoffFindUnique: vi.fn(),
  mockHandoffUpdateMany: vi.fn(),
  mockProfileFindFirst: vi.fn(),
  mockTokenFindUnique: vi.fn(),
  mockGetUserApifyClient: vi.fn(),
  mockValidateUserApifyAccountMatch: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  db: {
    apifyExtensionDevice: { findUnique: (...args: unknown[]) => mockDeviceFindUnique(...args) },
    apifyExtensionSession: {
      findUnique: (...args: unknown[]) => mockHandoffFindUnique(...args),
      updateMany: (...args: unknown[]) => mockHandoffUpdateMany(...args),
    },
    businessProfile: { findFirst: (...args: unknown[]) => mockProfileFindFirst(...args) },
    apifyToken: { findUnique: (...args: unknown[]) => mockTokenFindUnique(...args) },
  },
}));

vi.mock("@actorconsole/apify", () => ({
  getUserApifyClient: (...args: unknown[]) => mockGetUserApifyClient(...args),
  validateUserApifyAccountMatch: (...args: unknown[]) => mockValidateUserApifyAccountMatch(...args),
}));

import { extensionDeviceRoutes } from "../../src/routes/extension-device.js";

const token = `acx_${"a".repeat(64)}`;
const challenge = "challenge-value-that-is-long-enough-123456789";

function buildApp() {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.route("/extension-device", extensionDeviceRoutes);
  return app;
}

function authorize(input: Record<string, unknown>) {
  return buildApp().request("/extension-device/authorize-handoff", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ handoffId: "handoff_1", challenge, ...input }),
  });
}

describe("extension handoff account binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeviceFindUnique.mockResolvedValue({
      id: "device_1",
      userId: "user_1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastUsedAt: new Date(),
      user: {
        id: "user_1", name: "Sample", username: "sample", email: "sample@example.com",
        image: null, suspendedAt: null, deletionScheduledFor: null,
      },
    });
    mockHandoffFindUnique.mockResolvedValue({
      id: "handoff_1",
      userId: "user_1",
      deviceId: null,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      challengeHash: createHash("sha256").update(challenge).digest("hex"),
      apifyAccountId: null,
      apifyAccountType: null,
    });
    mockHandoffUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("binds a dashboard-started handoff to the account selected in the sidebar", async () => {
    const response = await authorize({
      apifyAccountId: "organization123",
      apifyAccountType: "ORGANIZATION",
    });

    expect(response.status).toBe(200);
    expect(mockHandoffUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ apifyAccountId: null }),
      data: {
        deviceId: "device_1",
        apifyAccountId: "organization123",
        apifyAccountType: "ORGANIZATION",
      },
    }));
  });

  it("rejects a sidebar account that differs from an explicit handoff target", async () => {
    mockHandoffFindUnique.mockResolvedValueOnce({
      id: "handoff_1",
      userId: "user_1",
      deviceId: null,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      challengeHash: createHash("sha256").update(challenge).digest("hex"),
      apifyAccountId: "organization123",
      apifyAccountType: "ORGANIZATION",
    });

    const response = await authorize({
      apifyAccountId: "anotherOrg123",
      apifyAccountType: "ORGANIZATION",
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("extension_handoff_account_mismatch");
    expect(mockHandoffUpdateMany).not.toHaveBeenCalled();
  });
});

describe("extension workspace connection check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeviceFindUnique.mockResolvedValue({
      id: "device_1", userId: "user_1", revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000), lastUsedAt: new Date(),
      user: {
        id: "user_1", name: "Sample", username: "sample", email: "sample@example.com",
        image: null, suspendedAt: null, deletionScheduledFor: null,
      },
    });
    mockProfileFindFirst.mockResolvedValue({ id: "workspace_1" });
    mockTokenFindUnique.mockResolvedValue({
      apifyUserId: "organization123", encryptedToken: "encrypted-api",
      encryptedUiToken: null, encryptedCookies: "encrypted-cookie",
    });
    mockGetUserApifyClient.mockResolvedValue({
      validateApiAuthentication: vi.fn().mockResolvedValue({ id: "organization123" }),
      validateConsoleAuthentication: vi.fn().mockResolvedValue(true),
    });
    mockValidateUserApifyAccountMatch.mockResolvedValue({ matches: true });
  });

  function check() {
    return buildApp().request("/extension-device/workspaces/workspace_1/apify/check", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it("confirms a saved session that can access the selected Apify account", async () => {
    const response = await check();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      confirmed: true, api: "VALID", console: "VALID", accountAccess: "VALID",
    });
    expect(mockValidateUserApifyAccountMatch).toHaveBeenCalledWith("user_1", "workspace_1");
  });

  it("explains when an organization has Console access but no API key", async () => {
    mockTokenFindUnique.mockResolvedValueOnce({
      apifyUserId: "organization123", encryptedToken: null,
      encryptedUiToken: null, encryptedCookies: "encrypted-cookie",
    });
    const response = await check();
    const body = await response.json();
    expect(body.data).toMatchObject({ confirmed: true, api: "MISSING", console: "VALID", accountAccess: "VALID" });
    expect(body.data.message).toContain("Add an Apify API key");
  });

  it("does not confirm a session without access to the saved organization", async () => {
    mockValidateUserApifyAccountMatch.mockResolvedValueOnce({ matches: false });
    const response = await check();
    expect((await response.json()).data).toMatchObject({ confirmed: false, accountAccess: "INVALID" });
  });

  it("reports an empty workspace as unconnected", async () => {
    mockTokenFindUnique.mockResolvedValueOnce(null);
    const response = await check();
    expect((await response.json()).data).toMatchObject({
      confirmed: false, api: "MISSING", console: "MISSING",
    });
    expect(mockGetUserApifyClient).not.toHaveBeenCalled();
  });

  it("rejects a workspace outside the paired ActorConsole account", async () => {
    mockProfileFindFirst.mockResolvedValueOnce(null);
    const response = await check();
    expect(response.status).toBe(404);
    expect(mockTokenFindUnique).not.toHaveBeenCalled();
  });
});
