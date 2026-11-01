import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  create: vi.fn(),
  hash: vi.fn(),
  issue: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    user: { findUnique: mocks.find, create: mocks.create },
    policy: { findFirst: vi.fn().mockResolvedValue(null) },
  },
  hashPassword: mocks.hash,
  issueAuthCode: mocks.issue,
  normalizeAuthEmail: (value: string) => value.trim().toLowerCase(),
  isValidAuthEmail: () => true,
  isValidPassword: () => true,
}));
vi.mock("../../../src/lib/auth-email.js", () => ({
  sendVerificationCode: mocks.send,
  sendRegistrationGuidance: mocks.send,
}));
import { POST } from "../../../src/routes/web-auth/register.js";
const register = () =>
  POST(
    new Request("https://app.example.test/auth/local/register", {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.test",
        password: "password123",
        termsAccepted: true,
      }),
    }),
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hash.mockResolvedValue("hashed-password");
  mocks.create.mockResolvedValue({ id: "u1", name: "User" });
  mocks.issue.mockResolvedValue({ code: "123456" });
  mocks.send.mockResolvedValue({ ok: true });
});
it.each([null, { id: "u1", passwordCredential: {} }, { id: "u1", passwordCredential: null }])(
  "does not disclose account existence or authentication method (%j)",
  async (existing) => {
    mocks.find.mockResolvedValue(existing);
    const response = await register();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.hash).toHaveBeenCalledOnce();
    if (existing) expect(mocks.create).not.toHaveBeenCalled();
  },
);
it.each(["delivery", "race", "code-outage"])(
  "keeps valid public registration responses generic on %s",
  async (failure) => {
    mocks.find.mockResolvedValue(null);
    if (failure === "delivery") mocks.send.mockResolvedValue({ ok: false, error: "offline" });
    if (failure === "race") mocks.create.mockRejectedValue({ code: "P2002" });
    if (failure === "code-outage") mocks.issue.mockRejectedValue(new Error("offline"));
    const response = await register();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  },
);
