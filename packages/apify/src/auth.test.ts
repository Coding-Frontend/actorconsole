import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockGetIntegration,
  mockGetIntegrationHealth,
  mockRecordIntegrationTest,
  mockSetIntegration,
  mockCreateApifyClient,
} = vi.hoisted(() => ({
  mockDb: {
    businessProfile: { findFirst: vi.fn() },
    apifyToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  mockGetIntegration: vi.fn(),
  mockGetIntegrationHealth: vi.fn(),
  mockRecordIntegrationTest: vi.fn(),
  mockSetIntegration: vi.fn(),
  mockCreateApifyClient: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  db: mockDb,
  getIntegration: (...args: unknown[]) => mockGetIntegration(...args),
  getIntegrationHealth: (...args: unknown[]) => mockGetIntegrationHealth(...args),
  recordIntegrationTest: (...args: unknown[]) => mockRecordIntegrationTest(...args),
  setIntegration: (...args: unknown[]) => mockSetIntegration(...args),
}));

vi.mock("@actorconsole/shared", async () => ({
  decrypt: vi.fn((value: string) => value),
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  selectActiveApifyConsoleCredential: (
    await vi.importActual<typeof import("@actorconsole/shared")>("@actorconsole/shared")
  ).selectActiveApifyConsoleCredential,
}));

vi.mock("./client.js", () => ({
  createApifyClient: (...args: unknown[]) => mockCreateApifyClient(...args),
}));

import { ApifyClientError } from "./errors.js";
import {
  getAdminApifyClient,
  getUserApifyClient,
  getApifyAccountIdentity,
  saveApifyToken,
  validateUserApifyAccountMatch,
} from "./auth.js";

describe("Apify credential selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIntegrationHealth.mockReset();
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";
  });

  it("builds the platform client from admin integrations and obtains the UI key from cookies", async () => {
    mockGetIntegration.mockImplementation(async (key: string) => {
      const values: Record<string, string> = {
        apify_api_token: "apify_api_platform",
        apify_ui_token: "platform-ui-key",
        apify_cookies: "ApifyRT=platform-cookie",
      };
      return values[key] ?? null;
    });
    mockGetIntegrationHealth.mockResolvedValue(null);
    const client = { getActor: vi.fn() };
    mockCreateApifyClient.mockReturnValue(client);

    await expect(getAdminApifyClient()).resolves.toBe(client);
    expect(mockCreateApifyClient).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "apify_api_platform",
        uiToken: undefined,
        cookies: "ApifyRT=platform-cookie",
        onConsoleCookieRefresh: expect.any(Function),
        onCredentialError: expect.any(Function),
      }),
    );
  });

  it("falls back to healthy admin cookies when the UI key has failed", async () => {
    mockGetIntegration.mockImplementation(async (key: string) => {
      const values: Record<string, string> = {
        apify_api_token: "apify_api_platform",
        apify_ui_token: "platform-ui-key",
        apify_cookies: "ApifyRT=platform-cookie",
      };
      return values[key] ?? null;
    });
    mockGetIntegrationHealth.mockImplementation(async (key: string) =>
      key === "apify_ui_token" ? { testStatus: "error" } : { testStatus: "ok" },
    );
    const client = { getActor: vi.fn() };
    mockCreateApifyClient.mockReturnValue(client);

    await expect(getAdminApifyClient()).resolves.toBe(client);
    expect(mockCreateApifyClient).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "apify_api_platform",
        uiToken: undefined,
        cookies: "ApifyRT=platform-cookie",
        onConsoleCookieRefresh: expect.any(Function),
      }),
    );
  });

  it("uses healthy user cookies when a legacy UI token is unhealthy", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValueOnce({
      encryptedToken: "stored-api-key",
      encryptedUiToken: "stored-ui-key",
      encryptedCookies: "ApifyRT=stored-cookie",
      apiTokenStatus: "VALID",
      uiTokenStatus: "ERROR",
      cookiesStatus: "VALID",
      apifyUserId: "apify-user",
    });
    const client = { getActor: vi.fn() };
    mockCreateApifyClient.mockReturnValue(client);

    await expect(getUserApifyClient("user-1", "workspace-1")).resolves.toBe(client);
    expect(mockCreateApifyClient).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "stored-api-key",
        uiToken: undefined,
        cookies: "ApifyRT=stored-cookie",
        consoleViewedUserId: "apify-user",
        onConsoleCookieRefresh: expect.any(Function),
      }),
    );
  });

  it("supports API-only and publishing-only workspace connections", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue(null);
    mockCreateApifyClient
      .mockReturnValueOnce({
        validateApiAuthentication: vi
          .fn()
          .mockResolvedValue({ id: "apify-user", username: "crawlerbros" }),
      })
      .mockReturnValueOnce({ validateConsoleAuthentication: vi.fn().mockResolvedValue(true) });
    mockDb.apifyToken.upsert.mockResolvedValue({});

    await expect(saveApifyToken("user-1", "a".repeat(30), "workspace-1")).resolves.toMatchObject({
      apiKeyConfigured: true,
      apifyUsername: "crawlerbros",
      uiTokenConfigured: false,
    });
    await expect(
      saveApifyToken("user-1", undefined, "workspace-1", `apify_ui_${"u".repeat(30)}`),
    ).resolves.toMatchObject({ apiKeyConfigured: false, uiTokenConfigured: true });
  });

  it("resolves a non-secret account identity for onboarding previews", async () => {
    const getMe = vi.fn().mockResolvedValue({
      id: "apify-account",
      username: "search-team",
      name: "Search Team",
      url: "https://apify.com/search-team",
    });
    mockCreateApifyClient.mockReturnValueOnce({ getMe });

    await expect(getApifyAccountIdentity("  apify_api_test-token  ")).resolves.toEqual({
      id: "apify-account",
      username: "search-team",
      name: "Search Team",
      displayName: "Search Team",
      url: "https://apify.com/search-team",
    });
    expect(mockCreateApifyClient).toHaveBeenCalledWith({
      token: "apify_api_test-token",
      maxRetries: 1,
      requestTimeoutMs: 8_000,
    });
  });

  it("reports replaced publishing credentials independently", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue({
      apifyUserId: "apify-user",
      encryptedToken: "stored-api-key",
      encryptedUiToken: null,
      encryptedCookies: "stored-expired-cookie",
      apiTokenStatus: "VALID",
      uiTokenStatus: "NOT_CONFIGURED",
      cookiesStatus: "EXPIRED",
    });
    mockCreateApifyClient.mockReturnValue({
      validateConsoleAuthentication: vi.fn().mockResolvedValue(true),
    });
    mockDb.apifyToken.upsert.mockResolvedValue({});

    await expect(
      saveApifyToken("user-1", undefined, "workspace-1", `apify_ui_${"u".repeat(30)}`),
    ).resolves.toMatchObject({
      apiKeyConfigured: true,
      apiTokenStatus: "VALID",
      uiTokenConfigured: true,
      uiTokenStatus: "VALID",
      cookiesConfigured: false,
      cookiesStatus: "NOT_CONFIGURED",
    });
  });

  it("extracts and encrypts only the UI token from copied request text", async () => {
    const uiToken = `apify_ui_${"t".repeat(30)}`;
    const copiedRequest = `curl 'https://console-backend.apify.com/actor/example/basic-info' -H 'authorization: Bearer ${uiToken}' -b 'ApifyRT=do-not-store'`;
    mockDb.apifyToken.findUnique.mockResolvedValue(null);
    mockCreateApifyClient.mockReturnValue({
      validateConsoleAuthentication: vi.fn().mockResolvedValue(true),
    });
    mockDb.apifyToken.upsert.mockResolvedValue({});

    await saveApifyToken("user-1", undefined, "workspace-1", copiedRequest);

    expect(mockCreateApifyClient).toHaveBeenCalledWith({ uiToken });
    expect(mockDb.apifyToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ encryptedUiToken: `encrypted:${uiToken}` }),
      }),
    );
  });

  it("extracts and encrypts only cookie pairs from a copied resume cURL", async () => {
    const copiedRequest = [
      "curl --location 'https://console-backend.apify.com/public/authentication/resume' \\",
      "--header 'origin: https://console.apify.com' \\",
      "--header 'Cookie: ApifyRT=dummy-refresh; ApifyProdUserId=dummy-user;' \\",
      '--data \'{"viewedUserId":"","forceAdminToken":false}\'',
    ].join("\n");
    mockDb.apifyToken.findUnique.mockResolvedValue(null);
    mockCreateApifyClient.mockImplementation((options: any) => ({
      validateConsoleAuthentication: vi.fn(async () => {
        await options.onConsoleCookieRefresh?.("ApifyRT=rotated-refresh");
        return true;
      }),
      resumeConsoleAuthentication: vi.fn().mockResolvedValue({
        userId: "dummy-user",
        uiToken: "console-token",
        hasElevatedPermissions: false,
        isAdmin: false,
      }),
    }));
    mockDb.apifyToken.upsert.mockResolvedValue({});

    await saveApifyToken("user-1", undefined, "workspace-1", undefined, copiedRequest);

    const cookies = "ApifyRT=dummy-refresh";
    expect(mockCreateApifyClient).toHaveBeenCalledWith({
      cookies,
      onConsoleCookieRefresh: expect.any(Function),
    });
    expect(mockDb.apifyToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ encryptedCookies: "encrypted:ApifyRT=rotated-refresh" }),
      }),
    );
  });

  it("rejects cookies that authenticate a different account than the API key", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue({
      apifyUserId: "api-user",
      apifyUsername: "correct-builder",
      encryptedToken: "stored-api-key",
      encryptedUiToken: null,
      encryptedCookies: null,
      apiTokenStatus: "VALID",
      uiTokenStatus: "NOT_CONFIGURED",
      cookiesStatus: "NOT_CONFIGURED",
    });
    mockCreateApifyClient.mockReturnValue({
      validateConsoleAuthentication: vi.fn().mockResolvedValue(true),
      resumeConsoleAuthentication: vi.fn().mockResolvedValue({
        userId: "different-console-user",
        uiToken: "console-token",
        hasElevatedPermissions: false,
        isAdmin: false,
      }),
      listConsoleOrganizations: vi.fn().mockResolvedValue([]),
    });

    await expect(
      saveApifyToken("user-1", undefined, "workspace-1", undefined, "ApifyRT=different-account"),
    ).rejects.toThrow("cannot access the Apify account or organization");
    expect(mockDb.apifyToken.upsert).not.toHaveBeenCalled();
  });

  it("accepts personal Console cookies that can access the API-key organization", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue({
      apifyUserId: "organization-id",
      apifyUsername: "organization-builder",
      encryptedToken: "stored-api-key",
      encryptedUiToken: null,
      encryptedCookies: null,
      apiTokenStatus: "VALID",
      uiTokenStatus: "NOT_CONFIGURED",
      cookiesStatus: "NOT_CONFIGURED",
    });
    mockCreateApifyClient.mockReturnValue({
      validateConsoleAuthentication: vi.fn().mockResolvedValue(true),
      resumeConsoleAuthentication: vi.fn().mockResolvedValue({
        userId: "personal-console-user",
        uiToken: "console-token",
        hasElevatedPermissions: false,
        isAdmin: false,
      }),
      listConsoleOrganizations: vi
        .fn()
        .mockResolvedValue([{ id: "organization-id", name: "Organization" }]),
    });
    mockDb.apifyToken.upsert.mockResolvedValue({});

    await expect(
      saveApifyToken("user-1", undefined, "workspace-1", undefined, "ApifyRT=organization-user"),
    ).resolves.toMatchObject({ cookiesConfigured: true, cookiesStatus: "VALID" });
    expect(mockCreateApifyClient).toHaveBeenCalledWith(
      expect.objectContaining({ consoleViewedUserId: "organization-id" }),
    );
  });

  it("connects a cookie-only workspace to an accessible organization", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue(null);
    mockDb.apifyToken.upsert.mockResolvedValue({});
    mockCreateApifyClient.mockReturnValue({
      validateConsoleAuthentication: vi.fn().mockResolvedValue(true),
      resumeConsoleAuthentication: vi.fn().mockResolvedValue({ userId: "personal-user" }),
      listConsoleOrganizations: vi.fn().mockResolvedValue([{ id: "organization-id" }]),
    });
    const publicProfile = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: { username: "team-actors" } }),
    } as Response);

    try {
      await expect(
        saveApifyToken(
          "user-1",
          undefined,
          "workspace-1",
          undefined,
          "ApifyRT=org-cookie",
          "personal-user",
          "organization-id",
          "ORGANIZATION",
        ),
      ).resolves.toMatchObject({
        apifyUserId: "organization-id",
        apifyUsername: "team-actors",
        accountType: "ORGANIZATION",
        cookiesConfigured: true,
      });
      expect(mockDb.apifyToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            apifyUserId: "organization-id",
            consoleUserId: "personal-user",
            apifyUsername: "team-actors",
          }),
        }),
      );
      expect(publicProfile).toHaveBeenCalledWith(
        "https://api.apify.com/v2/users/organization-id",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } finally {
      publicProfile.mockRestore();
    }
  });

  it("rejects an organization that the signed-in Console user cannot access", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue(null);
    mockCreateApifyClient.mockReturnValue({
      validateConsoleAuthentication: vi.fn().mockResolvedValue(true),
      resumeConsoleAuthentication: vi.fn().mockResolvedValue({ userId: "personal-user" }),
      listConsoleOrganizations: vi.fn().mockResolvedValue([]),
    });

    await expect(
      saveApifyToken(
        "user-1",
        undefined,
        "workspace-1",
        undefined,
        "ApifyRT=org-cookie",
        "personal-user",
        "organization-id",
        "ORGANIZATION",
      ),
    ).rejects.toThrow("cannot access the selected organization");
    expect(mockDb.apifyToken.upsert).not.toHaveBeenCalled();
  });

  it("keeps an existing API key bound to its own account", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue({
      apifyUserId: "another-organization",
      encryptedToken: "stored-api-key",
    });

    await expect(
      saveApifyToken(
        "user-1",
        undefined,
        "workspace-1",
        undefined,
        "ApifyRT=org-cookie",
        "personal-user",
        "organization-id",
        "ORGANIZATION",
      ),
    ).rejects.toThrow("saved API key belongs to a different Apify account");
    expect(mockCreateApifyClient).not.toHaveBeenCalled();
    expect(mockDb.apifyToken.upsert).not.toHaveBeenCalled();
  });

  it("marks saved cookies invalid when the connected identities no longer match", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue({
      id: "token-1",
      apifyUserId: "api-user",
      apifyUsername: "correct-builder",
      encryptedToken: "stored-api-key",
      encryptedUiToken: null,
      encryptedCookies: "ApifyRT=stored-refresh",
      apiTokenStatus: "VALID",
      uiTokenStatus: "NOT_CONFIGURED",
      cookiesStatus: "VALID",
      validationError: null,
    });
    mockDb.apifyToken.updateMany.mockResolvedValue({ count: 1 });
    mockCreateApifyClient.mockReturnValue({
      resumeConsoleAuthentication: vi.fn().mockResolvedValue({
        userId: "different-console-user",
        uiToken: "console-token",
        hasElevatedPermissions: false,
        isAdmin: false,
      }),
      listConsoleOrganizations: vi.fn().mockResolvedValue([]),
    });

    await expect(validateUserApifyAccountMatch("user-1", "workspace-1")).resolves.toMatchObject({
      matches: false,
      apiUsername: "correct-builder",
      consoleUserId: "different-console-user",
      message: expect.stringContaining("cannot access"),
    });
    expect(mockDb.apifyToken.updateMany).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: expect.objectContaining({
        cookiesStatus: "INVALID",
        validationError: expect.stringContaining("@correct-builder"),
      }),
    });
  });

  it("persists a rotated workspace cookie and restores its valid status", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue({
      id: "token-1",
      encryptedToken: null,
      encryptedUiToken: null,
      encryptedCookies: "ApifyRT=stored-refresh",
    });
    mockDb.apifyToken.updateMany.mockResolvedValue({ count: 1 });
    const client = { getActor: vi.fn() };
    mockCreateApifyClient.mockReturnValue(client);

    await expect(getUserApifyClient("user-1", "workspace-1")).resolves.toBe(client);
    const options = mockCreateApifyClient.mock.calls[0]?.[0] as {
      onConsoleCookieRefresh: (cookies: string) => Promise<void>;
    };
    await options.onConsoleCookieRefresh("ApifyRT=rotated-refresh");

    expect(mockDb.apifyToken.updateMany).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: expect.objectContaining({
        encryptedCookies: "encrypted:ApifyRT=rotated-refresh",
        cookiesStatus: "VALID",
        validationError: null,
      }),
    });
  });

  it("rejects a UI key and cookies submitted together", async () => {
    await expect(
      saveApifyToken(
        "user-1",
        "a".repeat(30),
        "workspace-1",
        `apify_ui_${"u".repeat(30)}`,
        "session=value",
      ),
    ).rejects.toThrow("not both");
    expect(mockDb.apifyToken.findUnique).not.toHaveBeenCalled();
  });

  it("marks only the rejected workspace API key as expired", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue({
      id: "token-1",
      encryptedToken: "stored-api-key",
      encryptedUiToken: "stored-ui-token",
      encryptedCookies: null,
    });
    mockDb.apifyToken.updateMany.mockResolvedValue({ count: 1 });
    const client = { getMe: vi.fn() };
    mockCreateApifyClient.mockReturnValue(client);

    await expect(getUserApifyClient("user-1", "workspace-1")).resolves.toBe(client);
    const options = mockCreateApifyClient.mock.calls[0]?.[0] as {
      onCredentialError: (
        credential: "api" | "console",
        error: ApifyClientError,
        context: { authentication: boolean },
      ) => Promise<void>;
    };
    await options.onCredentialError(
      "api",
      new ApifyClientError("unauthorized", "rejected", { status: 401 }),
      { authentication: false },
    );

    expect(mockDb.apifyToken.updateMany).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: expect.objectContaining({
        apiTokenStatus: "EXPIRED",
        validationError: expect.stringContaining("API key"),
      }),
    });
    expect(mockDb.apifyToken.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ uiTokenStatus: expect.anything() }),
      }),
    );
  });

  it("does not invalidate Console credentials for an operation-level forbidden response", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue({
      id: "token-1",
      encryptedToken: null,
      encryptedUiToken: null,
      encryptedCookies: "stored-cookie",
    });
    mockCreateApifyClient.mockReturnValue({ getActor: vi.fn() });

    await getUserApifyClient("user-1", "workspace-1");
    const options = mockCreateApifyClient.mock.calls[0]?.[0] as {
      onCredentialError: (
        credential: "api" | "console",
        error: ApifyClientError,
        context: { authentication: boolean },
      ) => Promise<void>;
    };
    await options.onCredentialError(
      "console",
      new ApifyClientError("forbidden", "operation not permitted", { status: 403 }),
      { authentication: false },
    );

    expect(mockDb.apifyToken.updateMany).not.toHaveBeenCalled();
  });

  it("restores only the credential that completes a successful authenticated request", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValue({
      id: "token-1",
      encryptedToken: "stored-api-key",
      encryptedUiToken: "stored-ui-token",
      encryptedCookies: null,
      apiTokenStatus: "EXPIRED",
      uiTokenStatus: "VALID",
      cookiesStatus: "NOT_CONFIGURED",
      validationError: "API key expired",
    });
    mockDb.apifyToken.updateMany.mockResolvedValue({ count: 1 });
    mockCreateApifyClient.mockReturnValue({ getMe: vi.fn() });

    await getUserApifyClient("user-1", "workspace-1");
    const options = mockCreateApifyClient.mock.calls[0]?.[0] as {
      onCredentialValid: (credential: "api" | "console") => Promise<void>;
    };
    await options.onCredentialValid("api");

    expect(mockDb.apifyToken.updateMany).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: expect.objectContaining({ apiTokenStatus: "VALID" }),
    });
    expect(mockDb.apifyToken.updateMany).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { validationError: null },
    });
  });

  it("marks the active admin cookie credential when UI-token recovery fails", async () => {
    mockGetIntegration.mockImplementation(async (key: string) =>
      key === "apify_cookies" ? "session=stored-cookie" : null,
    );
    mockCreateApifyClient.mockReturnValue({ getActor: vi.fn() });

    await getAdminApifyClient();
    const options = mockCreateApifyClient.mock.calls[0]?.[0] as {
      onCredentialError: (
        credential: "api" | "console",
        error: ApifyClientError,
        context: { authentication: boolean },
      ) => Promise<void>;
    };
    await options.onCredentialError(
      "console",
      new ApifyClientError("unauthorized", "cookie session expired", { status: 401 }),
      { authentication: true },
    );

    expect(mockRecordIntegrationTest).toHaveBeenCalledWith(
      "apify_cookies",
      "error",
      expect.stringContaining("expired"),
    );
  });

  it("persists a rotated admin cookie", async () => {
    mockGetIntegration.mockImplementation(async (key: string) =>
      key === "apify_cookies" ? "ApifyRT=stored-refresh" : null,
    );
    mockCreateApifyClient.mockReturnValue({ getActor: vi.fn() });

    await getAdminApifyClient();
    const options = mockCreateApifyClient.mock.calls[0]?.[0] as {
      onConsoleCookieRefresh: (cookies: string) => Promise<void>;
    };
    await options.onConsoleCookieRefresh("ApifyRT=rotated-refresh");

    expect(mockSetIntegration).toHaveBeenCalledWith(
      "apify_cookies",
      "ApifyRT=rotated-refresh",
      expect.objectContaining({ category: "apify", isSecret: true }),
    );
    expect(mockRecordIntegrationTest).toHaveBeenCalledWith(
      "apify_cookies",
      "ok",
      expect.stringContaining("valid"),
    );
  });
});
