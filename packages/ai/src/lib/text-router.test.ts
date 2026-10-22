import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  claim: vi.fn(),
  providers: vi.fn(),
  proxy: vi.fn(),
  cooldown: vi.fn(),
  quarantine: vi.fn(),
  disable: vi.fn(),
  proxyUrls: [] as string[],
}));

vi.mock("node-fetch", () => ({ default: mocks.fetch }));
vi.mock("https-proxy-agent", () => ({
  HttpsProxyAgent: class {
    constructor(url: string) {
      mocks.proxyUrls.push(url);
    }
  },
}));
vi.mock("@actorconsole/db", () => ({
  claimAiRoutingCredentials: (...args: unknown[]) => mocks.claim(...args),
  getAiRoutingProviders: (...args: unknown[]) => mocks.providers(...args),
  getAiRoutingProxy: (...args: unknown[]) => mocks.proxy(...args),
  coolDownAiCredential: (...args: unknown[]) => mocks.cooldown(...args),
  quarantineAiCredential: (...args: unknown[]) => mocks.quarantine(...args),
  disableAiRoutingProvider: (...args: unknown[]) => mocks.disable(...args),
}));

import {
  AiProviderUnavailableError,
  completeAiText,
  testAiProviderConnection,
} from "./text-router.js";

const freeProvider = {
  id: "free",
  key: "opencode_free" as const,
  type: "opencode_free" as const,
  autoDisableOnError: true,
  name: "OpenCode Free",
  priority: 10,
  model: "mimo-v2.5-free",
  baseUrl: "https://opencode.ai/zen/v1/chat/completions",
  useProxy: false,
  credentials: [],
};

const paidProvider = {
  ...freeProvider,
  id: "paid",
  key: "opencode_paid" as const,
  type: "opencode_paid" as const,
  name: "OpenCode Paid",
  priority: 20,
  model: "deepseek-v4-flash",
  baseUrl: "https://opencode.ai/zen/v1/chat/completions",
  useProxy: false,
  credentials: [],
};

function response(status: number, content?: string, retryAfter?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name === "retry-after" ? (retryAfter ?? null) : null) },
    text: vi.fn().mockResolvedValue(status >= 400 ? "provider error" : ""),
    json: vi.fn().mockResolvedValue({ choices: [{ message: { content } }] }),
  };
}

describe("completeAiText", () => {
  beforeEach(() => {
    for (const mock of [
      mocks.fetch,
      mocks.claim,
      mocks.providers,
      mocks.proxy,
      mocks.cooldown,
      mocks.quarantine,
      mocks.disable,
    ]) {
      mock.mockReset();
    }
    mocks.proxyUrls.length = 0;
    mocks.proxy.mockResolvedValue(null);
    mocks.cooldown.mockResolvedValue(undefined);
    mocks.quarantine.mockResolvedValue(undefined);
    mocks.disable.mockResolvedValue(undefined);
    mocks.claim.mockResolvedValue([
      { id: "key-1", label: "one", apiKey: "secret-one" },
      { id: "key-2", label: "two", apiKey: "secret-two" },
    ]);
  });

  it("falls through providers in priority order", async () => {
    mocks.providers.mockResolvedValue([freeProvider, paidProvider]);
    mocks.fetch
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, '{"value":"paid"}'));

    const result = await completeAiText({
      prompt: "test",
      parse: (text) => JSON.parse(text).value as string,
    });

    expect(result).toBe("paid");
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.claim).toHaveBeenCalledWith("paid", 2);
  });

  it("fails immediately without retry when no provider credential is usable", async () => {
    mocks.providers.mockResolvedValue([]);

    const error = await completeAiText({ prompt: "test", parse: (text) => text }).catch(
      (caught) => caught,
    );

    expect(error).toBeInstanceOf(AiProviderUnavailableError);
    expect(error).toMatchObject({ retryable: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("cools a rate-limited credential and rotates to the next key", async () => {
    mocks.providers.mockResolvedValue([{ ...paidProvider, autoDisableOnError: false }]);
    mocks.fetch
      .mockResolvedValueOnce(response(429, undefined, "60"))
      .mockResolvedValueOnce(response(200, '{"ok":true}'));

    await expect(
      completeAiText({ prompt: "test", parse: (text) => JSON.parse(text) }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.cooldown).toHaveBeenCalledWith("key-1", expect.any(Date));
    expect(mocks.quarantine).not.toHaveBeenCalled();
  });

  it("quarantines authentication failures", async () => {
    mocks.providers.mockResolvedValue([{ ...paidProvider, autoDisableOnError: false }]);
    mocks.fetch
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, '{"ok":true}'));

    await completeAiText({ prompt: "test", parse: (text) => JSON.parse(text) });
    expect(mocks.quarantine).toHaveBeenCalledWith("key-1", expect.stringContaining("401"));
  });

  it("retries one account once for a transient server failure", async () => {
    mocks.providers.mockResolvedValue([paidProvider]);
    mocks.claim.mockResolvedValue([{ id: "key-1", label: "one", apiKey: "secret-one" }]);
    mocks.fetch
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, '{"ok":true}'));

    await expect(
      completeAiText({ prompt: "test", parse: (text) => JSON.parse(text) }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves the exact configured proxy credentials across retries", async () => {
    mocks.providers.mockResolvedValue([{ ...freeProvider, useProxy: true }]);
    mocks.proxy.mockResolvedValue({
      protocol: "http",
      host: "proxy.example.com",
      port: 8080,
      username: "account,session-existing",
      password: "proxy-password",
    });
    mocks.fetch
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, '{"ok":true}'));
    await completeAiText({ prompt: "test", parse: JSON.parse });
    expect(mocks.proxyUrls).toHaveLength(2);
    expect(mocks.proxyUrls[0]).toBe(mocks.proxyUrls[1]);
    const url = new URL(mocks.proxyUrls[0]);
    expect(decodeURIComponent(url.username)).toBe("account,session-existing");
    expect(decodeURIComponent(url.password)).toBe("proxy-password");
  });

  it.each([
    "opencode_free",
    "opencode_paid",
    "kilocode",
    "openrouter",
    "gemini_ai_studio",
    "openai",
  ])("uses only standard application headers for %s", async (type) => {
    mocks.providers.mockResolvedValue([{ ...freeProvider, type }]);
    mocks.fetch.mockResolvedValue(response(200, "ok"));
    await completeAiText({ prompt: "test", parse: (text) => text });
    expect(mocks.fetch.mock.calls[0][1].headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer secret-one",
    });
  });

  it("ignores legacy client impersonation settings", async () => {
    mocks.providers.mockResolvedValue([
      {
        ...freeProvider,
        useOpenCodeHeaders: true,
        openCodeClient: "cli",
        openCodeUserAgent: "opencode/2.0.0/cli",
        openCodeSessionId: "old-session",
        openCodeProjectId: "old-project",
      },
    ]);
    mocks.fetch.mockResolvedValue(response(200, "ok"));
    await completeAiText({ prompt: "test", parse: (text) => text });
    expect(mocks.fetch.mock.calls[0][1].headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer secret-one",
    });
  });

  it("does not send anonymous requests for free providers", async () => {
    mocks.providers.mockResolvedValue([freeProvider]);
    mocks.claim.mockResolvedValue([]);
    await expect(completeAiText({ prompt: "test", parse: (text) => text })).rejects.toMatchObject({
      retryable: false,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.disable).not.toHaveBeenCalled();
  });

  it("requires a real configured key for connection tests", async () => {
    await expect(testAiProviderConnection(freeProvider, null, null)).rejects.toThrow(
      "No enabled API key configured",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValue(response(200, '{"ok":true}'));
    await testAiProviderConnection(
      freeProvider,
      { id: "key-1", label: "one", apiKey: "secret-one" },
      null,
    );
    expect(mocks.fetch.mock.calls[0][1].headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer secret-one",
    });
  });

  it("reports a sanitized exhaustion error after an endpoint rejection", async () => {
    mocks.providers.mockResolvedValue([freeProvider]);
    mocks.fetch.mockResolvedValueOnce({
      ...response(400),
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ error: { type: "server_error", message: "Model is unavailable." } }),
        ),
    });

    const error = await completeAiText({ prompt: "test", parse: (text) => text }).catch(
      (caught) => caught,
    );

    expect(error).toBeInstanceOf(AiProviderUnavailableError);
    expect(error).toMatchObject({
      message: "Configured AI providers could not produce a valid response",
    });
    expect(mocks.disable).toHaveBeenCalledWith(
      "free",
      expect.stringContaining("Model is unavailable"),
    );
  });

  it("falls back when output validation fails and returns a sanitized exhaustion error", async () => {
    mocks.providers.mockResolvedValue([freeProvider]);
    mocks.fetch
      .mockResolvedValueOnce(response(200, "not-json"))
      .mockResolvedValueOnce(response(200, "still-not-json"));

    const error = await completeAiText({ prompt: "test", parse: (text) => JSON.parse(text) }).catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(AiProviderUnavailableError);
    expect(error).toMatchObject({ retryable: false });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.disable).not.toHaveBeenCalled();
  });

  it.each([401, 402, 403, 404, 410])(
    "disables an entry after HTTP %i and falls through to another entry of the same type",
    async (status) => {
      const next = { ...freeProvider, id: "free-2", key: "opencode_free-2" };
      let active = [freeProvider, next];
      mocks.providers.mockImplementation(async () => active);
      mocks.claim.mockResolvedValue([{ id: "key-1", label: "one", apiKey: "secret-one" }]);
      mocks.disable.mockImplementation(async (id: string) => {
        active = active.filter((entry) => entry.id !== id);
      });
      mocks.fetch.mockResolvedValueOnce(response(status)).mockResolvedValue(response(200, "ok"));
      await expect(completeAiText({ prompt: "first", parse: (text) => text })).resolves.toBe("ok");
      expect(mocks.disable).toHaveBeenCalledWith("free", expect.stringContaining(`HTTP ${status}`));
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      await completeAiText({ prompt: "second", parse: (text) => text });
      expect(mocks.claim.mock.calls.map((call) => call[0])).toEqual(["free", "free-2", "free-2"]);
    },
  );

  it.each([
    [429, "insufficient_quota", "Please check your billing details"],
    [400, "FreeUsageLimitError", "Free user limit reached"],
    [402, "payment_required", "Insufficient credits"],
  ])("disables permanent quota and free-user errors (%i %s)", async (status, code, message) => {
    mocks.providers.mockResolvedValue([paidProvider, freeProvider]);
    mocks.fetch
      .mockResolvedValueOnce({
        ...response(status as number),
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: { code, message } })),
      })
      .mockResolvedValue(response(200, "ok"));
    await completeAiText({ prompt: "test", parse: (text) => text });
    expect(mocks.disable).toHaveBeenCalledWith("paid", expect.stringContaining(String(code)));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("recognizes an embedded access error in an HTTP 200 response", async () => {
    mocks.providers.mockResolvedValue([freeProvider, paidProvider]);
    mocks.fetch
      .mockResolvedValueOnce({
        ...response(200),
        json: vi.fn().mockResolvedValue({ error: { code: 403, message: "Access denied" } }),
      })
      .mockResolvedValue(response(200, "ok"));
    await completeAiText({ prompt: "test", parse: (text) => text });
    expect(mocks.disable).toHaveBeenCalledWith("free", expect.stringContaining("Access denied"));
  });

  it.each([429, 503])("keeps a temporarily failing HTTP %i entry enabled", async (status) => {
    mocks.providers.mockResolvedValue([paidProvider, freeProvider]);
    mocks.fetch
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(response(status))
      .mockResolvedValue(response(200, "ok"));
    await completeAiText({ prompt: "test", parse: (text) => text });
    expect(mocks.disable).not.toHaveBeenCalled();
  });

  it("sanitizes API keys before saving a disable reason", async () => {
    mocks.providers.mockResolvedValue([paidProvider, freeProvider]);
    mocks.fetch
      .mockResolvedValueOnce({
        ...response(403),
        text: vi.fn().mockResolvedValue("Invalid secret-one"),
      })
      .mockResolvedValue(response(200, "ok"));
    await completeAiText({ prompt: "test", parse: (text) => text });
    expect(mocks.disable.mock.calls[0][1]).toContain("[redacted]");
    expect(mocks.disable.mock.calls[0][1]).not.toContain("secret-one");
  });

  it("applies automatic deactivation to a failed connection test", async () => {
    mocks.fetch.mockResolvedValue(response(403));
    await expect(
      testAiProviderConnection(
        freeProvider,
        { id: "key-1", label: "one", apiKey: "secret-one" },
        null,
      ),
    ).rejects.toThrow("HTTP 403");
    expect(mocks.disable).toHaveBeenCalledWith("free", expect.any(String));
  });

  it("uses OpenAI reasoning parameters for an independently named entry", async () => {
    mocks.providers.mockResolvedValue([
      { ...paidProvider, key: "openai-123", type: "openai", model: "gpt-5-mini" },
    ]);
    mocks.fetch.mockResolvedValue(response(200, "ok"));
    await completeAiText({ prompt: "test", parse: (text) => text, maxTokens: 2048 });
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ max_completion_tokens: 2048, reasoning_effort: "low" });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_tokens");
    expect(mocks.fetch.mock.calls[0][1].headers).not.toHaveProperty("x-opencode-client");
  });
});
