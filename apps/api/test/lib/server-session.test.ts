import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt, hashRecoveryCode, totpCode } from "@actorconsole/shared";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  challenge: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  createSession: vi.fn(),
  loginEvent: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    user: mocks.user,
    twoFactorChallenge: mocks.challenge,
    session: { create: mocks.createSession },
    loginEvent: { create: mocks.loginEvent },
    $transaction: mocks.transaction,
  },
}));

import { completeUserLogin, type AuthUser } from "../../src/lib/server-session.js";
import { withRequestContext } from "../../src/lib/http-context.js";

const passphrase = "local-two-factor-test-fixture";
const secret = "JBSWY3DPEHPK3PXP";
const recoveryCode = "ABCDE-12345";
const recoveryHash = hashRecoveryCode(recoveryCode, "u1", passphrase);
const user: AuthUser = {
  id: "u1", email: "person@example.com", name: "Person", image: null, plan: "FREE",
  suspendedAt: null, emailVerified: new Date(), totpEnabled: true,
  totpSecretEncrypted: encrypt(secret, passphrase, "totp:u1"),
  totpRecoveryCodes: [recoveryHash, "other-recovery-hash"],
};

function signIn(challengeToken: string, code = recoveryCode, authUser = user) {
  const request = new Request("http://localhost/auth/local/login", { method: "POST" });
  return withRequestContext(request, () =>
    completeUserLogin(request, authUser, { challengeToken, totpCode: code }),
  );
}

describe("two-factor session creation", () => {
  let remaining: string[];
  let challenges: Map<string, { id: string; userId: string; expiresAt: Date; attempts: number; usedAt: Date | null }>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APP_ENCRYPTION_KEY", passphrase);
    vi.stubEnv("AUTH_URL", "http://localhost");
    remaining = [...user.totpRecoveryCodes as string[]];
    challenges = new Map(["challenge-a", "challenge-b"].map((token) => [
      createHash("sha256").update(token).digest("hex"),
      { id: token, userId: user.id, expiresAt: new Date(Date.now() + 60_000), attempts: 0, usedAt: null },
    ]));
    mocks.challenge.findUnique.mockImplementation(async ({ where }) => {
      const challenge = challenges.get(where.tokenHash);
      return challenge ? { ...challenge } : null;
    });
    mocks.challenge.updateMany.mockImplementation(async ({ where, data }) => {
      const challenge = [...challenges.values()].find((value) => value.id === where.id);
      if (!challenge || challenge.usedAt || challenge.attempts !== where.attempts) return { count: 0 };
      Object.assign(challenge, data);
      return { count: 1 };
    });
    mocks.user.findUnique.mockImplementation(async () => ({
      totpEnabled: true, totpSecretEncrypted: user.totpSecretEncrypted, totpRecoveryCodes: [...remaining],
    }));
    mocks.user.update.mockImplementation(async ({ data }) => {
      remaining = data.totpRecoveryCodes;
      return {};
    });
    mocks.user.updateMany.mockImplementation(async ({ where, data }) => {
      if (JSON.stringify(where.totpRecoveryCodes.equals) !== JSON.stringify(remaining)) return { count: 0 };
      remaining = data.totpRecoveryCodes;
      return { count: 1 };
    });
    mocks.transaction.mockImplementation((callback) => callback({
      user: mocks.user, twoFactorChallenge: mocks.challenge,
    }));
    mocks.createSession.mockResolvedValue({});
    mocks.loginEvent.mockResolvedValue({});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("allows only one concurrent sign-in for a recovery code across different challenges", async () => {
    const responses = await Promise.all([signIn("challenge-a"), signIn("challenge-b")]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(remaining).toEqual(["other-recovery-hash"]);
    expect(responses.filter((response) => response.headers.getSetCookie().length)).toHaveLength(1);
  });

  it("rejects replay after a recovery code has been consumed", async () => {
    expect((await signIn("challenge-a")).status).toBe(200);
    expect((await signIn("challenge-b")).status).toBe(401);
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it("rejects a recovery code removed after the login user was loaded", async () => {
    remaining = [];
    expect((await signIn("challenge-a")).status).toBe(401);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("allows only one session per TOTP challenge", async () => {
    const code = totpCode(secret);
    const responses = await Promise.all([signIn("challenge-a", code), signIn("challenge-a", code)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(mocks.createSession).toHaveBeenCalledOnce();
    expect(remaining).toEqual(user.totpRecoveryCodes);
  });

  it("counts invalid second factors without issuing a session", async () => {
    const response = await signIn("challenge-a", "wrong-code");
    expect(response.status).toBe(401);
    expect([...challenges.values()][0].attempts).toBe(1);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
