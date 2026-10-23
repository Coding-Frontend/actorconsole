import { afterEach, describe, expect, it, vi } from "vitest";

const { init, withSentryConfig } = vi.hoisted(() => ({
  init: vi.fn(),
  withSentryConfig: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ init }));
vi.mock("@sentry/nextjs/config", () => ({ withSentryConfig }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Sentry 11 configuration", () => {
  it.each(["server", "edge"])("keeps sensitive data collection disabled in %s", async (runtime) => {
    vi.stubEnv("SENTRY_DSN", "https://public@sentry.invalid/1");
    if (runtime === "server") await import("../../sentry.server.config");
    else await import("../../sentry.edge.config");

    expect(init).toHaveBeenCalledOnce();
    const options = init.mock.calls[0][0];
    expect(options).not.toHaveProperty("sendDefaultPii");
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      httpHeaders: {
        request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
        response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
      },
    });
  });

  it("uses the new build configuration entry point when uploads are enabled", async () => {
    vi.stubEnv("SENTRY_AUTH_TOKEN", "test-token");
    await import("../../next.config");
    expect(withSentryConfig).toHaveBeenCalledOnce();
    expect(withSentryConfig.mock.calls[0][1]).toMatchObject({
      authToken: "test-token",
      webpack: { treeshake: { removeDebugLogging: true } },
    });
    expect(withSentryConfig.mock.calls[0][1]).not.toHaveProperty("disableLogger");
  });
});
