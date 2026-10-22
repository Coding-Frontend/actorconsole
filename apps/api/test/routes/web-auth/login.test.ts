import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  count: vi.fn(),
  verifyPassword: vi.fn(),
  completeUserLogin: vi.fn(),
  recordLoginEvent: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  db: {
    user: { findUnique: mocks.findUnique },
    loginEvent: { count: mocks.count },
  },
  normalizeAuthEmail: (value: string) => value.trim().toLowerCase(),
  verifyPassword: (...args: unknown[]) => mocks.verifyPassword(...args),
}));
vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));
vi.mock("../../../src/lib/server-session.js", () => ({
  authUserSelect: {},
  completeUserLogin: (...args: unknown[]) => mocks.completeUserLogin(...args),
  recordLoginEvent: (...args: unknown[]) => mocks.recordLoginEvent(...args),
}));

import { POST } from "../../../src/routes/web-auth/login.js";

const user = {
  id: "user-1",
  email: "user@example.com",
  emailVerified: new Date(),
  plan: "FREE",
  suspendedAt: null,
  name: "User",
  image: null,
  totpEnabled: false,
  totpSecretEncrypted: null,
  totpRecoveryCodes: [],
  passwordCredential: { passwordHash: "stored-password-hash" },
};

function request(password = "correct-password") {
  return new Request("http://localhost/api/auth/local/login", {
    method: "POST",
    body: JSON.stringify({ email: " USER@example.com ", password }),
  });
}

describe("local password login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ ...user });
    mocks.count.mockResolvedValue(0);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.completeUserLogin.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  });

  it("verifies the local hash and delegates session creation", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.verifyPassword).toHaveBeenCalledWith("correct-password", "stored-password-hash");
    expect(mocks.completeUserLogin).toHaveBeenCalledOnce();
  });

  it("uses a valid dummy hash for an unknown account", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await POST(request("wrong-password"));

    expect(response.status).toBe(401);
    expect(mocks.verifyPassword.mock.calls[0]?.[1]).toMatch(/^scrypt\$/);
    expect(mocks.completeUserLogin).not.toHaveBeenCalled();
  });

  it("requires verification before creating a session", async () => {
    mocks.findUnique.mockResolvedValue({ ...user, emailVerified: null });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "EMAIL_UNVERIFIED" });
    expect(mocks.completeUserLogin).not.toHaveBeenCalled();
  });

  it("rate limits repeated failures before checking the password", async () => {
    mocks.count.mockResolvedValue(10);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });
});
