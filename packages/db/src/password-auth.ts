import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import type { AuthCodePurpose } from "@prisma/client";
import { db } from "./client";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 32 * 1024 * 1024;
const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const AUTH_CODE_WINDOW_MS = 60 * 60 * 1000;
const AUTH_CODE_LIMIT = 5;
const AUTH_CODE_MAX_ATTEMPTS = 5;

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export function normalizeAuthEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidAuthEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAuthEmail(value));
}

export function isValidPassword(value: string): boolean {
  return value.length >= 8 && value.length <= 128;
}

export async function hashPassword(password: string): Promise<string> {
  if (!isValidPassword(password)) {
    throw new Error("Password must be between 8 and 128 characters");
  }
  const salt = randomBytes(16);
  const key = await derivePassword(password, salt);
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    const [algorithm, n, r, p, saltValue, keyValue] = encoded.split("$");
    if (
      algorithm !== "scrypt" ||
      Number(n) !== SCRYPT_N ||
      Number(r) !== SCRYPT_R ||
      Number(p) !== SCRYPT_P ||
      !saltValue ||
      !keyValue
    ) {
      return false;
    }
    const expected = Buffer.from(keyValue, "base64url");
    if (expected.length !== SCRYPT_KEY_LENGTH) return false;
    const actual = await derivePassword(password, Buffer.from(saltValue, "base64url"));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for authentication codes");
  return secret;
}

function hashAuthCode(userId: string, purpose: AuthCodePurpose, code: string): string {
  return createHmac("sha256", authSecret()).update(`${purpose}:${userId}:${code}`).digest("hex");
}

export async function issueAuthCode(
  userId: string,
  purpose: AuthCodePurpose,
): Promise<{ code: string; expiresAt: Date }> {
  const recentCount = await db.authCode.count({
    where: {
      userId,
      purpose,
      createdAt: { gte: new Date(Date.now() - AUTH_CODE_WINDOW_MS) },
    },
  });
  if (recentCount >= AUTH_CODE_LIMIT) {
    throw new Error("AUTH_CODE_RATE_LIMITED");
  }

  const code = String(randomInt(100_000, 1_000_000));
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);
  await db.$transaction([
    db.authCode.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    db.authCode.create({
      data: {
        userId,
        purpose,
        tokenHash: hashAuthCode(userId, purpose, code),
        expiresAt,
      },
    }),
  ]);
  return { code, expiresAt };
}

export async function consumeAuthCode(
  userId: string,
  purpose: AuthCodePurpose,
  code: string,
): Promise<boolean> {
  const record = await db.authCode.findFirst({
    where: { userId, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt <= new Date() || record.attempts >= AUTH_CODE_MAX_ATTEMPTS) {
    return false;
  }

  const supplied = hashAuthCode(userId, purpose, code.trim());
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const storedBuffer = Buffer.from(record.tokenHash, "hex");
  const valid =
    suppliedBuffer.length === storedBuffer.length && timingSafeEqual(suppliedBuffer, storedBuffer);
  const nextAttempts = record.attempts + 1;
  const claimed = await db.authCode.updateMany({
    where: { id: record.id, usedAt: null, attempts: record.attempts },
    data: {
      attempts: nextAttempts,
      usedAt: valid || nextAttempts >= AUTH_CODE_MAX_ATTEMPTS ? new Date() : null,
    },
  });
  return valid && claimed.count === 1;
}
