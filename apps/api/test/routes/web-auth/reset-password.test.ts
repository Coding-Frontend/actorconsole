import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  consumeAuthCode: vi.fn(),
  hashPassword: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  consumeAuthCode: (...args: unknown[]) => mocks.consumeAuthCode(...args),
  hashPassword: (...args: unknown[]) => mocks.hashPassword(...args),
  isValidPassword: (value: string) => value.length >= 8 && value.length <= 128,
  normalizeAuthEmail: (value: string) => value.trim().toLowerCase(),
  db: {
    user: { findUnique: mocks.findUnique, update: mocks.update },
    passwordCredential: { upsert: mocks.upsert },
    session: { deleteMany: mocks.deleteMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

import { POST } from "../../../src/routes/web-auth/reset-password.js";

function request(code = "123456", password = "new-password") {
  return new Request("http://localhost/api/auth/local/reset-password", {
    method: "POST",
    body: JSON.stringify({ email: " SOCIAL@example.com ", code, password }),
  });
}

describe("local password reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ id: "social-user-1" });
    mocks.consumeAuthCode.mockResolvedValue(true);
    mocks.hashPassword.mockResolvedValue("new-password-hash");
    mocks.upsert.mockReturnValue("upsert-operation");
    mocks.update.mockReturnValue("update-operation");
    mocks.deleteMany.mockReturnValue("delete-sessions-operation");
    mocks.transaction.mockResolvedValue([]);
  });

  it("adds a local password to a social-only account and revokes sessions", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.consumeAuthCode).toHaveBeenCalledWith("social-user-1", "RESET_PASSWORD", "123456");
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId: "social-user-1" },
      create: { userId: "social-user-1", passwordHash: "new-password-hash" },
      update: { passwordHash: "new-password-hash" },
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: "social-user-1" } });
    expect(mocks.transaction).toHaveBeenCalledWith([
      "upsert-operation",
      "update-operation",
      "delete-sessions-operation",
    ]);
  });

  it("rejects an invalid or expired code without changing credentials", async () => {
    mocks.consumeAuthCode.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("validates code and password format before looking up the account", async () => {
    const response = await POST(request("bad", "short"));

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
