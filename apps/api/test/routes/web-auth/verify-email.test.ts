import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  consumeAuthCode: vi.fn(),
  completeUserLogin: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  db: { user: { findUnique: mocks.findUnique, update: mocks.update } },
  consumeAuthCode: (...args: unknown[]) => mocks.consumeAuthCode(...args),
  normalizeAuthEmail: (value: string) => value.trim().toLowerCase(),
}));
vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));
vi.mock("../../../src/lib/server-session.js", () => ({
  authUserSelect: {},
  completeUserLogin: (...args: unknown[]) => mocks.completeUserLogin(...args),
}));

import { POST } from "../../../src/routes/web-auth/verify-email.js";

const user = {
  id: "user-1",
  email: "user@example.com",
  emailVerified: null,
  plan: "FREE",
  suspendedAt: null,
  name: "User",
  image: null,
  totpEnabled: false,
  totpSecretEncrypted: null,
  totpRecoveryCodes: [],
};

function request(code = "123456") {
  return new Request("http://localhost/api/auth/local/verify-email", {
    method: "POST",
    body: JSON.stringify({ email: " USER@example.com ", code }),
  });
}

describe("local email verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ ...user });
    mocks.update.mockResolvedValue({ ...user, emailVerified: new Date() });
    mocks.completeUserLogin.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  });

  it("consumes the code, verifies the user, and creates a session", async () => {
    mocks.consumeAuthCode.mockResolvedValue(true);
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.consumeAuthCode).toHaveBeenCalledWith("user-1", "VERIFY_EMAIL", "123456");
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.completeUserLogin).toHaveBeenCalledOnce();
  });

  it("does not create a session for an invalid code", async () => {
    mocks.consumeAuthCode.mockResolvedValue(false);
    const response = await POST(request("000000"));

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.completeUserLogin).not.toHaveBeenCalled();
  });

  it("cannot be used as a login bypass after the email is verified", async () => {
    mocks.findUnique.mockResolvedValue({ ...user, emailVerified: new Date() });
    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.consumeAuthCode).not.toHaveBeenCalled();
    expect(mocks.completeUserLogin).not.toHaveBeenCalled();
  });
});
