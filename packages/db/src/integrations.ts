import { decrypt, encrypt, getLogger } from "@actorconsole/shared";
import { db } from "./index";

const log = getLogger("db:integrations");

export interface IntegrationHealthSnapshot {
  lastTestedAt: Date | null;
  testStatus: string | null;
  testMessage: string | null;
}

export async function getIntegration(key: string): Promise<string | null> {
  const row = await db.integration.findUnique({ where: { key } });
  if (row?.value) {
    const passphrase = process.env.APP_ENCRYPTION_KEY;
    if (!passphrase) {
      log.error(
        { key },
        "Stored integration cannot be decrypted because APP_ENCRYPTION_KEY is missing",
      );
      await db.integration.updateMany({
        where: { key },
        data: {
          lastTestedAt: new Date(),
          testStatus: "error",
          testMessage: "Stored credential cannot be decrypted. Update it to restore access.",
        },
      });
      return null;
    }
    try {
      return decrypt(row.value, passphrase, key);
    } catch (error) {
      log.error({ key, error }, "Stored integration could not be decrypted");
      await db.integration.updateMany({
        where: { key },
        data: {
          lastTestedAt: new Date(),
          testStatus: "error",
          testMessage: "Stored credential cannot be decrypted. Update it to restore access.",
        },
      });
      return null;
    }
  }
  const aliases: Record<string, string | undefined> = {
    email_from_address: process.env.RESEND_FROM_EMAIL,
  };
  return process.env[key.toUpperCase()] ?? aliases[key] ?? null;
}

/**
 * Read credential health without decrypting or returning the credential
 * value. This is used when choosing between independent fallback credentials.
 */
export async function getIntegrationHealth(key: string): Promise<IntegrationHealthSnapshot | null> {
  const row = await db.integration.findUnique({
    where: { key },
    select: { lastTestedAt: true, testStatus: true, testMessage: true },
  });
  if (!row) return null;
  return row;
}

export async function setIntegration(
  key: string,
  value: string,
  meta: { label?: string; description?: string; category?: string; isSecret?: boolean } = {},
): Promise<void> {
  const passphrase = process.env.APP_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error("APP_ENCRYPTION_KEY is required to store integration credentials");
  }
  const encrypted = encrypt(value, passphrase, key);
  await db.integration.upsert({
    where: { key },
    create: {
      key,
      label: meta.label ?? key,
      description: meta.description ?? null,
      category: meta.category ?? "other",
      isSecret: meta.isSecret ?? true,
      value: encrypted,
    },
    update: {
      value: encrypted,
      isSecret: meta.isSecret ?? undefined,
      lastTestedAt: null,
      testStatus: null,
      testMessage: null,
    },
  });
}

export async function deleteIntegration(key: string): Promise<void> {
  await db.integration.deleteMany({ where: { key } });
}

export async function recordIntegrationTest(
  key: string,
  status: "ok" | "error",
  message: string,
): Promise<void> {
  await db.integration.updateMany({
    where: { key },
    data: { lastTestedAt: new Date(), testStatus: status, testMessage: message },
  });
}
