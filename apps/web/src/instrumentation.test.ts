import { afterEach, describe, expect, it, vi } from "vitest";
const capture = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureRequestError: capture }));
import { onRequestError, register } from "./instrumentation";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("web request error reporting", () => {
  const args = [
    new Error("request failed"),
    { path: "/example", method: "GET", headers: {} },
    { routerKind: "App Router", routePath: "/example", routeType: "render" },
  ] as Parameters<typeof onRequestError>;
  it("does not initialize or transmit when monitoring is unconfigured", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    await register();
    await onRequestError(...args);
    expect(capture).not.toHaveBeenCalled();
  });
  it("forwards request errors to the configured Sentry SDK", async () => {
    vi.stubEnv("SENTRY_DSN", "https://fixture@example.test/1");
    await onRequestError(...args);
    expect(capture).toHaveBeenCalledWith(...args);
  });
});
