import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), session: vi.fn(), createSession: vi.fn(), deleteSession: vi.fn(), verifyPassword: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    user: { findUnique: mocks.user },
    session: { findUnique: mocks.session, create: mocks.createSession, deleteMany: mocks.deleteSession },
    loginEvent: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
  },
  normalizeAuthEmail: (value: string) => value.trim().toLowerCase(), verifyPassword: mocks.verifyPassword,
}));
vi.mock("../../../src/lib/rate-limit.js", () => ({ checkRateLimit: mocks.rateLimit }));
import { webAuthRoutes } from "../../../src/routes/web-auth.js";

const app = new Hono().route("/", webAuthRoutes);
const user = {
  id: "u1", email: "person@example.com", name: "Person", image: null, plan: "FREE", role: "USER",
  emailVerified: new Date(), suspendedAt: null, deletionScheduledFor: null,
  totpEnabled: false, totpSecretEncrypted: null, totpRecoveryCodes: [], passwordCredential: { passwordHash: "stored-hash" },
};
const session = { expires: new Date(Date.now() + 86_400_000), impersonatedById: null, impersonationExpiresAt: null, user };
function login(origin = "http://localhost:8080") {
  return app.request("/auth/local/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: "password123" }) });
}
describe("API-owned browser sessions", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AUTH_URL", "https://actorconsole.com");
    mocks.user.mockResolvedValue(user); mocks.session.mockResolvedValue(session);
    mocks.createSession.mockResolvedValue({}); mocks.deleteSession.mockResolvedValue({ count: 1 });
    mocks.verifyPassword.mockResolvedValue(true); mocks.rateLimit.mockResolvedValue({ allowed: true });
  });
  it("issues a secure cookie, reads safe session data, and revokes the same session on logout", async () => {
    const response = await login();
    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie()[0];
    expect(cookie).toContain("__Secure-authjs.session-token=");
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=Lax");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const sessionCookie = cookie.split(";")[0];
    const identity = await app.request("/auth/session", { headers: { cookie: sessionCookie } });
    const body = await identity.json();
    expect(body.user.id).toBe(user.id);
    expect(body.user.passwordCredential).toBeUndefined(); expect(body.user.totpSecretEncrypted).toBeUndefined();
    expect(identity.headers.get("cache-control")).toContain("no-store");
    const logout = await app.request("/auth/signout", { method: "POST", headers: { cookie: sessionCookie } });
    expect(logout.status).toBe(200); expect(mocks.deleteSession).toHaveBeenCalledOnce();
    expect(logout.headers.getSetCookie()).toHaveLength(2);
    expect(logout.headers.getSetCookie().every((value) => value.includes("Max-Age=0"))).toBe(true);
  });
  it("rejects cross-origin JSON login and logout", async () => {
    expect((await login("https://attacker.example")).status).toBe(403);
    expect((await app.request("/auth/signout", { method: "POST", headers: { origin: "https://attacker.example" } })).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.deleteSession).not.toHaveBeenCalled();
  });
  it("returns null for missing or expired cookies", async () => {
    expect(await (await app.request("/auth/session")).json()).toBeNull();
    expect(mocks.session).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue({ ...session, expires: new Date(0) });
    expect(await (await app.request("/auth/session", { headers: { cookie: "authjs.session-token=expired" } })).json()).toBeNull();
  });
  it("rejects malformed bodies and enforces the authentication rate limit", async () => {
    expect((await app.request("/auth/local/login", { method: "POST", body: "{" })).status).toBe(400);
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 10_000 });
    const response = await login(); expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("10");
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });
});
