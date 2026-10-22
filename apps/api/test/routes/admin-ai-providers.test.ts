import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCredential: vi.fn(),
  createProvider: vi.fn(),
  deleteProvider: vi.fn(),
  replaceCredential: vi.fn(),
  saveProxy: vi.fn(),
  clearProxy: vi.fn(),
  providerUpdate: vi.fn(),
  providerFindMany: vi.fn(),
  providerFindUnique: vi.fn(),
  proxyFindUnique: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

const tx = { aiProvider: { update: mocks.providerUpdate, findMany: mocks.providerFindMany } };
vi.mock("@actorconsole/db", () => ({
  db: {
    aiProvider: {
      findMany: (...args: unknown[]) => mocks.providerFindMany(...args),
      findUnique: (...args: unknown[]) => mocks.providerFindUnique(...args),
      update: (...args: unknown[]) => mocks.providerUpdate(...args),
      deleteMany: (...args: unknown[]) => mocks.deleteProvider(...args),
    },
    aiProxyConfig: { findUnique: (...args: unknown[]) => mocks.proxyFindUnique(...args) },
    aiProviderCredential: { findFirst: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: (...args: unknown[]) => mocks.auditCreate(...args) },
    appError: { create: vi.fn() },
    session: { findUnique: vi.fn() },
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
  createAiProviderCredential: (...args: unknown[]) => mocks.createCredential(...args),
  createAiProvider: (...args: unknown[]) => mocks.createProvider(...args),
  replaceAiProviderCredential: (...args: unknown[]) => mocks.replaceCredential(...args),
  saveAiProxyConfig: (...args: unknown[]) => mocks.saveProxy(...args),
  clearAiProxyPassword: (...args: unknown[]) => mocks.clearProxy(...args),
  decryptAiProviderCredential: vi.fn(),
  getAiRoutingProxy: vi.fn(),
  recordAiCredentialTest: vi.fn(),
  recordAiProviderTest: vi.fn(),
  recordAiProxyTest: vi.fn(),
}));
vi.mock("@actorconsole/ai", () => ({
  testAiProviderConnection: vi.fn(),
  testAiProxyConnection: vi.fn(),
}));

import { adminAiProviderRoutes } from "../../src/routes/admin-ai-providers.js";

function request(path: string, init?: RequestInit) {
  const app = new Hono();
  app.route("/admin/ai-providers", adminAiProviderRoutes);
  return app.request(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-admin-api-key": "test-admin-key",
      ...(init?.headers as Record<string, string>),
    },
  });
}

const provider = {
  id: "free",
  key: "opencode_free",
  type: "opencode_free",
  autoDisableOnError: true,
  disabledAt: null,
  disabledReason: null,
  name: "OpenCode Free",
  enabled: true,
  priority: 10,
  model: "mimo-v2.5-free",
  baseUrl: "https://opencode.ai/zen/v1/chat/completions",
  useProxy: true,
  useOpenCodeHeaders: true,
  openCodeClient: "cli",
  openCodeUserAgent: "opencode/1.15.0/cli",
  openCodeSessionId: "session-id",
  openCodeProjectId: "project-id",
  lastTestedAt: null,
  testStatus: null,
  testMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  credentials: [
    {
      id: "key-1",
      label: "Primary",
      enabled: true,
      authErrorAt: null,
      encryptedApiKey: "encrypted",
      createdAt: new Date(),
    },
  ],
};

describe("admin AI provider routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = "test-admin-key";
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
  });

  it("returns provider readiness without exposing secrets", async () => {
    mocks.providerFindMany.mockResolvedValue([provider]);
    mocks.proxyFindUnique.mockResolvedValue({
      id: "default",
      protocol: "http",
      host: "proxy.apify.com",
      port: 8000,
      username: "groups-auto",
      encryptedPassword: "encrypted",
      lastTestedAt: null,
      testStatus: null,
      testMessage: null,
    });

    const response = await request("/admin/ai-providers");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.providers[0].readiness).toMatchObject({ ready: true, proxyReady: true });
    expect(JSON.stringify(body)).not.toContain("encrypted");
    expect(body.data.proxy.passwordConfigured).toBe(true);
    for (const key of [
      "useOpenCodeHeaders",
      "openCodeClient",
      "openCodeUserAgent",
      "openCodeSessionId",
      "openCodeProjectId",
    ]) {
      expect(body.data.providers[0]).not.toHaveProperty(key);
    }
  });

  it("atomically rewrites all provider priorities", async () => {
    const keys = ["kilocode", "opencode_free", "opencode_paid", "gemini_ai_studio"];
    mocks.providerFindMany.mockResolvedValue(keys.map((key) => ({ key })));
    const response = await request("/admin/ai-providers/reorder", {
      method: "PUT",
      body: JSON.stringify({ keys }),
    });

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.providerUpdate).toHaveBeenCalledTimes(4);
    expect(mocks.providerUpdate).toHaveBeenLastCalledWith({
      where: { key: "gemini_ai_studio" },
      data: { priority: 4 },
    });
  });

  it("stores additional labeled API keys through the encrypted DB helper", async () => {
    mocks.providerFindUnique.mockResolvedValue({ ...provider, id: "paid", key: "opencode_paid" });
    mocks.createCredential.mockResolvedValue("credential-1");
    const response = await request("/admin/ai-providers/opencode_paid/credentials", {
      method: "POST",
      body: JSON.stringify({ label: "Paid account 2", apiKey: "super-secret-key" }),
    });

    expect(response.status).toBe(201);
    expect(mocks.createCredential).toHaveBeenCalledWith({
      providerId: "paid",
      label: "Paid account 2",
      apiKey: "super-secret-key",
    });
    expect(await response.json()).not.toHaveProperty("data.apiKey");
  });

  it("allows an administrator to change the provider model", async () => {
    mocks.providerFindUnique.mockResolvedValue({ ...provider, useProxy: false });
    mocks.providerUpdate.mockResolvedValue({ ...provider, model: "big-pickle" });
    const response = await request("/admin/ai-providers/opencode_free", {
      method: "PUT",
      body: JSON.stringify({ model: "big-pickle" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.providerUpdate).toHaveBeenCalledWith({
      where: { key: "opencode_free" },
      data: {
        model: "big-pickle",
        lastTestedAt: null,
        testStatus: null,
        testMessage: null,
      },
    });
  });

  it("saves proxy fields while keeping an existing password when omitted", async () => {
    mocks.proxyFindUnique.mockResolvedValue({ encryptedPassword: "existing-encrypted" });
    const response = await request("/admin/ai-providers/proxy", {
      method: "PUT",
      body: JSON.stringify({
        protocol: "http",
        host: "proxy.apify.com",
        port: 8000,
        username: "groups-auto",
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.saveProxy).toHaveBeenCalledWith(
      expect.objectContaining({ host: "proxy.apify.com", username: "groups-auto" }),
    );
    expect(await response.json()).toMatchObject({ data: { passwordConfigured: true } });
  });

  it.each([
    "useOpenCodeHeaders",
    "openCodeClient",
    "openCodeUserAgent",
    "openCodeSessionId",
    "openCodeProjectId",
  ])("rejects removed client impersonation setting %s", async (field) => {
    const result = await request("/admin/ai-providers/opencode_free", {
      method: "PUT",
      body: JSON.stringify({ [field]: field === "useOpenCodeHeaders" ? true : "legacy" }),
    });
    expect(result.status).toBe(400);
    expect(mocks.providerUpdate).not.toHaveBeenCalled();
  });

  it("stores an encrypted API key for OpenCode Free", async () => {
    mocks.providerFindUnique.mockResolvedValue(provider);
    mocks.createCredential.mockResolvedValue("credential-1");
    const result = await request("/admin/ai-providers/opencode_free/credentials", {
      method: "POST",
      body: JSON.stringify({ label: "Zen account", apiKey: "secret-key" }),
    });
    expect(result.status).toBe(201);
    expect(mocks.createCredential).toHaveBeenCalledWith({
      providerId: "free",
      label: "Zen account",
      apiKey: "secret-key",
    });
    expect(JSON.stringify(await result.json())).not.toContain("secret-key");
  });

  it("requires an API key to create or enable OpenCode Free", async () => {
    const created = await request("/admin/ai-providers", {
      method: "POST",
      body: JSON.stringify({ type: "opencode_free", name: "Free", enabled: true }),
    });
    expect(created.status).toBe(409);
    expect(mocks.createProvider).not.toHaveBeenCalled();
    mocks.providerFindUnique.mockResolvedValue({ ...provider, useProxy: false, credentials: [] });
    const enabled = await request("/admin/ai-providers/opencode_free", {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    });
    expect(enabled.status).toBe(409);
    expect(mocks.providerUpdate).not.toHaveBeenCalled();
  });

  it.each(["gemini_ai_studio", "openrouter", "openai", "opencode_free"])(
    "adds independent %s entries with presets and redacted audits",
    async (type) => {
      mocks.createProvider.mockImplementation(async (input) => ({
        id: "new",
        key: `${type}-new`,
        type: input.type,
      }));
      const result = await request("/admin/ai-providers", {
        method: "POST",
        body: JSON.stringify({
          type,
          name: "Backup account",
          apiKey: "secret-new-key",
          enabled: true,
        }),
      });
      expect(result.status).toBe(201);
      expect(mocks.createProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type,
          name: "Backup account",
          apiKey: "secret-new-key",
          enabled: true,
          autoDisableOnError: true,
          model: expect.any(String),
          baseUrl: expect.any(String),
        }),
      );
      expect(JSON.stringify(await result.json())).not.toContain("secret-new-key");
      expect(JSON.stringify(mocks.auditCreate.mock.calls)).not.toContain("secret-new-key");
    },
  );

  it("rejects enabling a new paid provider without credentials", async () => {
    const result = await request("/admin/ai-providers", {
      method: "POST",
      body: JSON.stringify({ type: "openai", name: "No key", enabled: true }),
    });
    expect(result.status).toBe(409);
    expect(mocks.createProvider).not.toHaveBeenCalled();
  });

  it.each([["one", "one"], ["one"], ["one", "unknown"]])(
    "rejects duplicate, incomplete or stale provider orders %j",
    async (...keys) => {
      mocks.providerFindMany.mockResolvedValue([{ key: "one" }, { key: "two" }]);
      const result = await request("/admin/ai-providers/reorder", {
        method: "PUT",
        body: JSON.stringify({ keys }),
      });
      expect([400, 409]).toContain(result.status);
      expect(mocks.providerUpdate).not.toHaveBeenCalled();
    },
  );

  it("reorders duplicate provider types using their instance keys", async () => {
    const keys = ["gemini_ai_studio-two", "gemini_ai_studio-one", "openai-three"];
    mocks.providerFindMany.mockResolvedValue(keys.map((key) => ({ key })));
    const result = await request("/admin/ai-providers/reorder", {
      method: "PUT",
      body: JSON.stringify({ keys }),
    });
    expect(result.status).toBe(200);
    expect(mocks.providerUpdate.mock.calls.map((call) => call[0])).toEqual(
      keys.map((key, index) => ({ where: { key }, data: { priority: index + 1 } })),
    );
  });

  it("clears the automatic disable reason when manually re-enabled", async () => {
    mocks.providerFindUnique.mockResolvedValue({
      ...provider,
      key: "opencode_free-backup",
      enabled: false,
      useProxy: false,
      disabledReason: "HTTP 403",
    });
    mocks.providerUpdate.mockResolvedValue({});
    const result = await request("/admin/ai-providers/opencode_free-backup", {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    });
    expect(result.status).toBe(200);
    expect(mocks.providerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "opencode_free-backup" },
        data: expect.objectContaining({ enabled: true, disabledAt: null, disabledReason: null }),
      }),
    );
  });

  it("removes one entry by its instance key", async () => {
    mocks.deleteProvider.mockResolvedValue({ count: 1 });
    const result = await request("/admin/ai-providers/openai-backup", { method: "DELETE" });
    expect(result.status).toBe(200);
    expect(mocks.deleteProvider).toHaveBeenCalledWith({ where: { key: "openai-backup" } });
  });
});
