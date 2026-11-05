import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  linkedAccount: vi.fn(),
  existingUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  createAccount: vi.fn(),
  verifyIdToken: vi.fn(),
  completeUserLogin: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        account: {
          findUnique: mocks.linkedAccount,
          create: mocks.createAccount,
        },
        user: {
          findUnique: mocks.existingUser,
          create: mocks.createUser,
          update: mocks.updateUser,
        },
      }),
  },
}));
vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));
vi.mock("../../../src/lib/firebase-admin.js", () => ({
  verifyIdToken: mocks.verifyIdToken,
}));
vi.mock("../../../src/lib/server-session.js", () => ({
  authUserSelect: {},
  completeUserLogin: mocks.completeUserLogin,
}));
import { POST } from "../../../src/routes/web-auth/firebase-session.js";

const user = {
  id: "application-user",
  email: "person@example.com",
  emailVerified: new Date(),
};
function request() {
  return new Request("http://localhost/api/auth/firebase-session", {
    method: "POST",
    body: JSON.stringify({ idToken: "private-token" }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.verifyIdToken.mockResolvedValue({
    uid: "firebase-user",
    sub: "firebase-user",
    email: user.email,
    email_verified: true,
    firebase: {
      sign_in_provider: "google.com",
      identities: { "google.com": ["provider-id"] },
    },
  });
  mocks.linkedAccount.mockResolvedValue(null);
  mocks.existingUser.mockResolvedValue(null);
  mocks.createUser.mockResolvedValue(user);
  mocks.updateUser.mockResolvedValue(user);
  mocks.completeUserLogin.mockImplementation(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { "set-cookie": "session=private-session; HttpOnly; Path=/" },
      }),
  );
});

describe("social signup analytics metadata", () => {
  it("marks new application users and preserves the session response headers", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, isNewUser: true });
    expect(response.headers.get("set-cookie")).toContain(
      "session=private-session",
    );
    expect(mocks.createUser).toHaveBeenCalledOnce();
    expect(mocks.createAccount).toHaveBeenCalledOnce();
    expect(mocks.completeUserLogin).toHaveBeenCalledWith(
      expect.any(Request),
      user,
      {
        totpCode: undefined,
        challengeToken: undefined,
      },
    );
  });

  it("does not mark a previously linked social account as a signup", async () => {
    mocks.linkedAccount.mockResolvedValue({ user });
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it("does not mark linking a social identity to an existing email account as a signup", async () => {
    mocks.existingUser.mockResolvedValue(user);
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.createAccount).toHaveBeenCalledOnce();
  });

  it("preserves failed login responses without adding signup success metadata", async () => {
    mocks.completeUserLogin.mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), { status: 403 }),
    );
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false });
  });
});
