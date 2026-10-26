import { requestCookies } from "./http-context.js";
import { JsonResponse } from "./http-context.js";
import { createHash, randomBytes } from "node:crypto";
import { db, Prisma } from "@actorconsole/db";
import { decrypt, getLogger, hashRecoveryCode, verifyTotpCode } from "@actorconsole/shared";
import { getAuthSessionCookieName, getAuthSessionCookieOptions } from "./auth-session-cookie.js";
import { consumeTwoFactorRecoveryCode } from "./two-factor-recovery.js";
import { getAuthRequestIp } from "./auth-request-ip.js";

const log = getLogger("api:auth");
const TOTP_KEY_PREFIX = "totp:";

export const authUserSelect = {
  id: true,
  email: true,
  plan: true,
  suspendedAt: true,
  name: true,
  image: true,
  emailVerified: true,
  totpEnabled: true,
  totpSecretEncrypted: true,
  totpRecoveryCodes: true,
} satisfies Prisma.UserSelect;

export type AuthUser = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

export async function recordLoginEvent(req: Request, userId: string, success: boolean) {
  await db.loginEvent
    .create({
      data: {
        userId,
        ip: getAuthRequestIp(req),
        userAgent: req.headers.get("user-agent")?.slice(0, 191) ?? null,
        success,
      },
    })
    .catch((error) => log.warn({ error, userId, success }, "Could not record login event"));
}

export async function completeUserLogin(
  req: Request,
  user: AuthUser,
  input: { totpCode?: string; challengeToken?: string } = {},
): Promise<JsonResponse> {
  if (user.suspendedAt) {
    await recordLoginEvent(req, user.id, false);
    return JsonResponse.json({ ok: false, error: "Account is suspended" }, { status: 403 });
  }

  if (user.totpEnabled) {
    if (!input.challengeToken || !input.totpCode) {
      const recentChallengeCount = await db.twoFactorChallenge.count({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
      });
      if (recentChallengeCount >= 3) {
        await recordLoginEvent(req, user.id, false);
        return JsonResponse.json(
          { ok: false, error: "Too many two-factor challenges. Try again in 15 minutes." },
          { status: 429 },
        );
      }
      const rawChallenge = randomBytes(32).toString("base64url");
      await db.twoFactorChallenge.create({
        data: {
          userId: user.id,
          tokenHash: createHash("sha256").update(rawChallenge).digest("hex"),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      return JsonResponse.json({
        ok: true,
        requiresTwoFactor: true,
        challengeToken: rawChallenge,
      });
    }

    const challenge = await db.twoFactorChallenge.findUnique({
      where: {
        tokenHash: createHash("sha256").update(input.challengeToken).digest("hex"),
      },
    });
    if (
      !challenge ||
      challenge.userId !== user.id ||
      challenge.usedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attempts >= 5
    ) {
      return JsonResponse.json(
        { ok: false, error: "The two-factor challenge has expired" },
        { status: 401 },
      );
    }

    const passphrase = process.env.APP_ENCRYPTION_KEY;
    let valid = false;
    let recoveryHash: string | null = null;
    if (passphrase && user.totpSecretEncrypted) {
      try {
        const secret = decrypt(
          user.totpSecretEncrypted,
          passphrase,
          `${TOTP_KEY_PREFIX}${user.id}`,
        );
        valid = verifyTotpCode(secret, input.totpCode);
      } catch (error) {
        log.error({ error, userId: user.id }, "Two-factor secret could not be decrypted");
      }
    }
    if (!valid && passphrase) {
      const hash = hashRecoveryCode(input.totpCode, user.id, passphrase);
      const recoveryCodes = Array.isArray(user.totpRecoveryCodes)
        ? user.totpRecoveryCodes.filter((item): item is string => typeof item === "string")
        : [];
      if (recoveryCodes.includes(hash)) recoveryHash = hash;
    }
    if (!valid && !recoveryHash) {
      await recordLoginEvent(req, user.id, false);
      const nextAttempts = challenge.attempts + 1;
      await db.twoFactorChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, attempts: challenge.attempts },
        data: { attempts: nextAttempts, usedAt: nextAttempts >= 5 ? new Date() : null },
      });
      return JsonResponse.json({ ok: false, error: "Invalid two-factor code" }, { status: 401 });
    }

    if (recoveryHash) {
      const consumed = await db.$transaction(async (tx) => {
        const claim = await tx.twoFactorChallenge.updateMany({
          where: { id: challenge.id, usedAt: null, attempts: challenge.attempts },
          data: { usedAt: new Date() },
        });
        if (claim.count !== 1) return false;
        return consumeTwoFactorRecoveryCode(tx, user.id, recoveryHash, user.totpSecretEncrypted ?? "");
      });
      if (!consumed) {
        return JsonResponse.json(
          { ok: false, error: "The two-factor challenge has expired" },
          { status: 401 },
        );
      }
      log.info({ userId: user.id }, "A recovery code was used for sign-in");
    } else {
      const claim = await db.twoFactorChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, attempts: challenge.attempts },
        data: { usedAt: new Date() },
      });
      if (claim.count !== 1) {
        return JsonResponse.json(
          { ok: false, error: "The two-factor challenge has expired" },
          { status: 401 },
        );
      }
    }
  }

  const sessionToken = randomBytes(48).toString("base64url");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { sessionToken, userId: user.id, expires } });
  await recordLoginEvent(req, user.id, true);

  const cookieStore = await requestCookies();
  cookieStore.set(getAuthSessionCookieName(req), sessionToken, getAuthSessionCookieOptions(req));
  return JsonResponse.json({ ok: true });
}
