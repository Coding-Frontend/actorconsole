import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  providerFindMany: vi.fn(),
  providerCreate: vi.fn(),
  providerFindFirst: vi.fn(),
  providerDisable: vi.fn(),
}));

const transactionClient = {
  aiProvider: {
    create: (...args: unknown[]) => mocks.providerCreate(...args),
    findFirst: (...args: unknown[]) => mocks.providerFindFirst(...args),
  },
  aiProviderCredential: {
    findMany: (...args: unknown[]) => mocks.findMany(...args),
    update: (...args: unknown[]) => mocks.update(...args),
  },
};

vi.mock("./index.js", () => ({
  db: {
    aiProvider: {
      findMany: (...args: unknown[]) => mocks.providerFindMany(...args),
      updateMany: (...args: unknown[]) => mocks.providerDisable(...args),
    },
    aiProviderCredential: {
      create: (...args: unknown[]) => mocks.create(...args),
      findUniqueOrThrow: (...args: unknown[]) => mocks.findUniqueOrThrow(...args),
    },
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

import {
  claimAiRoutingCredentials,
  createAiProviderCredential,
  createAiProvider,
  disableAiRoutingProvider,
  decryptAiProviderCredential,
  getAiRoutingProviders,
} from "./ai-providers.js";

describe("AI provider credential persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key-with-enough-entropy";
    mocks.create.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
    mocks.transaction.mockImplementation(
      (callback: (client: typeof transactionClient) => unknown) => callback(transactionClient),
    );
  });

  afterEach(() => {
    delete process.env.APP_ENCRYPTION_KEY;
  });

  it("encrypts API keys using a credential-specific salt", async () => {
    const id = await createAiProviderCredential({
      providerId: "provider-1",
      label: "Account one",
      apiKey: "plain-api-key",
    });
    const createCall = mocks.create.mock.calls[0][0];
    expect(id).toBe(createCall.data.id);
    expect(createCall.data.encryptedApiKey).toMatch(/^v1:/);
    expect(createCall.data.encryptedApiKey).not.toContain("plain-api-key");

    mocks.findUniqueOrThrow.mockResolvedValue({ encryptedApiKey: createCall.data.encryptedApiKey });
    await expect(decryptAiProviderCredential(id)).resolves.toBe("plain-api-key");
  });

  it("claims least-recently-used credentials transactionally and decrypts them", async () => {
    await createAiProviderCredential({
      providerId: "provider-1",
      label: "Account one",
      apiKey: "plain-api-key",
    });
    const stored = mocks.create.mock.calls[0][0].data;
    mocks.findMany.mockResolvedValue([
      {
        id: stored.id,
        label: stored.label,
        encryptedApiKey: stored.encryptedApiKey,
      },
    ]);

    await expect(claimAiRoutingCredentials("provider-1", 2)).resolves.toEqual([
      { id: stored.id, label: "Account one", apiKey: "plain-api-key" },
    ]);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, orderBy: expect.any(Array) }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: stored.id }, data: { lastUsedAt: expect.any(Date) } }),
    );
  });

  it("does not expose legacy impersonation settings to the router", async () => {
    const settings = {
      useOpenCodeHeaders: true,
      openCodeClient: "cli",
      openCodeUserAgent: "opencode/1.15.0/cli",
      openCodeSessionId: "persistent-session",
      openCodeProjectId: "persistent-project",
    };
    mocks.providerFindMany.mockResolvedValue([
      {
        id: "free",
        key: "opencode_free",
        type: "opencode_free",
        autoDisableOnError: true,
        name: "OpenCode Free",
        priority: 10,
        model: "mimo-v2.5-free",
        baseUrl: "https://opencode.ai/zen/v1/chat/completions",
        useProxy: true,
        credentials: [{ id: "key-1" }],
        ...settings,
      },
    ]);
    for (let index = 0; index < 2; index += 1) {
      const providers = await getAiRoutingProviders();
      expect(providers).toHaveLength(1);
      for (const key of Object.keys(settings)) expect(providers[0]).not.toHaveProperty(key);
    }
  });

  it("skips OpenCode Free when no credential is eligible", async () => {
    mocks.providerFindMany.mockResolvedValue([
      { id: "free", key: "opencode_free", type: "opencode_free", credentials: [] },
    ]);
    await expect(getAiRoutingProviders()).resolves.toEqual([]);
  });

  it("creates multiple entries of the same type with distinct identities and encrypted keys", async () => {
    mocks.providerFindFirst.mockResolvedValue({ priority: 4 });
    mocks.providerCreate.mockImplementation(async ({ data }) => data);
    const input = {
      type: "gemini_ai_studio" as const,
      name: "Gemini backup",
      model: "gemini-test",
      baseUrl: "https://example.com/chat",
      enabled: true,
      useProxy: false,
      autoDisableOnError: true,
      apiKey: "secret-key",
    };
    const first = await createAiProvider(input);
    const second = await createAiProvider(input);
    expect(first.key).not.toBe(second.key);
    expect(first.id).not.toBe(second.id);
    expect(first.type).toBe(second.type);
    const stored = mocks.providerCreate.mock.calls[0][0].data;
    expect(stored.priority).toBe(5);
    expect(stored).not.toHaveProperty("apiKey");
    expect(stored.credentials.create.encryptedApiKey).toMatch(/^v1:/);
    expect(stored.credentials.create.encryptedApiKey).not.toContain("secret-key");
    mocks.findUniqueOrThrow.mockResolvedValue(stored.credentials.create);
    await expect(decryptAiProviderCredential(stored.credentials.create.id)).resolves.toBe(
      "secret-key",
    );
  });

  it("persists deactivation only when the entry is enabled and permits automatic disabling", async () => {
    mocks.providerDisable.mockResolvedValue({ count: 1 });
    await disableAiRoutingProvider("provider-1", "HTTP 403: access denied");
    expect(mocks.providerDisable).toHaveBeenCalledWith({
      where: { id: "provider-1", enabled: true, autoDisableOnError: true },
      data: expect.objectContaining({
        enabled: false,
        disabledAt: expect.any(Date),
        disabledReason: "HTTP 403: access denied",
      }),
    });
  });

  it("loads independent entries by type and asks the database to skip disabled entries", async () => {
    mocks.providerFindMany.mockResolvedValue([
      { id: "one", key: "opencode_free-one", type: "opencode_free", credentials: [{ id: "key" }] },
      { id: "two", key: "opencode_free-two", type: "opencode_free", credentials: [{ id: "key" }] },
      {
        id: "three",
        key: "gemini_ai_studio-three",
        type: "gemini_ai_studio",
        credentials: [{ id: "credential" }],
      },
    ]);
    expect((await getAiRoutingProviders()).map((provider) => provider.key)).toEqual([
      "opencode_free-one",
      "opencode_free-two",
      "gemini_ai_studio-three",
    ]);
    expect(mocks.providerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enabled: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
    );
  });
});
