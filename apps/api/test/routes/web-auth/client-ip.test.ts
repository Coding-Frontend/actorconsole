import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), loginEvent: vi.fn(), session: vi.fn() }));
vi.mock("@actorconsole/db", () => ({
  normalizeAuthEmail: (email: string) => email.trim().toLowerCase(),
  verifyPassword: vi.fn().mockResolvedValue(true),
  db: {
    user: { findUnique: mocks.user }, session: { create: mocks.session },
    loginEvent: { count: vi.fn().mockResolvedValue(0), create: mocks.loginEvent },
  },
}));
vi.mock("../../../src/lib/queue.js", () => ({ getRedis: () => null }));
import { webAuthRoutes } from "../../../src/routes/web-auth.js";

const app = new Hono().route("/", webAuthRoutes);
const user = {
  id: "local-login", email: "local@example.test", emailVerified: new Date(), plan: "FREE",
  name: null, image: null, suspendedAt: null, totpEnabled: false,
  passwordCredential: { passwordHash: "mocked-only" },
};

describe("authentication uses the API owner's verified client-IP contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRUSTED_PROXY_IPS", "");
    mocks.user.mockResolvedValue(null);
    mocks.loginEvent.mockResolvedValue({});
    mocks.session.mockResolvedValue({});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects request 31 despite rotating all caller-controlled address headers", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 31; index++) {
      const response = await app.request("/auth/local/forgot-password", {
        method: "POST", headers: {
          "content-type": "application/json", "x-forwarded-for": `203.0.113.${index + 1}`,
          "x-real-ip": `203.0.113.${index + 1}`, "cf-connecting-ip": `203.0.113.${index + 1}`,
        }, body: JSON.stringify({ email: "unknown-local@example.test" }),
      }, { incoming: { socket: { remoteAddress: "192.0.2.51" } } });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([...Array(30).fill(200), 429]);
  });

  it.each([
    ["::ffff:192.0.2.52", "", "203.0.113.1", "192.0.2.52"],
    [undefined, "", "203.0.113.2", null],
    ["127.0.0.1", "127.0.0.1", "203.0.113.3, 192.0.2.53", "192.0.2.53"],
  ])("records verified requester metadata for login (peer %s)", async (peer, trusted, chain, expected) => {
    vi.stubEnv("TRUSTED_PROXY_IPS", trusted);
    mocks.user.mockResolvedValue(user);
    const response = await app.request("/auth/local/login", {
      method: "POST", headers: {
        "content-type": "application/json", "x-forwarded-for": chain,
        "x-real-ip": "203.0.113.99", "cf-connecting-ip": "203.0.113.98",
      }, body: JSON.stringify({ email: user.email, password: "local-mocked-password" }),
    }, peer ? { incoming: { socket: { remoteAddress: peer } } } : {});
    expect(response.status).toBe(200);
    expect(mocks.loginEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: user.id, ip: expected, success: true }),
    });
  });
});
