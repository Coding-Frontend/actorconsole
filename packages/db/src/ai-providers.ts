import { randomUUID } from "node:crypto";
import {
  AI_PROVIDER_BY_KEY,
  decrypt,
  encrypt,
  getLogger,
  type AiProviderKey,
} from "@actorconsole/shared";
import { db } from "./index.js";

const log = getLogger("db:ai-providers");
const PROXY_ID = "default";

export interface AiRoutingCredential {
  id: string;
  label: string;
  apiKey: string;
}

export interface AiRoutingProvider {
  id: string;
  key: string;
  type: AiProviderKey;
  autoDisableOnError: boolean;
  name: string;
  priority: number;
  model: string;
  baseUrl: string;
  useProxy: boolean;
  credentials: AiRoutingCredential[];
}

export interface AiRoutingProxy {
  protocol: "http" | "https";
  host: string;
  port: number;
  username: string;
  password: string;
}

function encryptionKey(): string {
  const value = process.env.APP_ENCRYPTION_KEY;
  if (!value) throw new Error("APP_ENCRYPTION_KEY is required for AI provider credentials");
  return value;
}

function credentialSalt(id: string): string {
  return `ai-provider-credential:${id}`;
}

export async function getAiRoutingProviders(): Promise<AiRoutingProvider[]> {
  const now = new Date();
  const rows = await db.aiProvider.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      credentials: {
        where: {
          enabled: true,
          authErrorAt: null,
          OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
        },
        orderBy: [{ lastUsedAt: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return rows.flatMap((row) => {
    const definition = AI_PROVIDER_BY_KEY[row.type as AiProviderKey];
    if (!definition) return [];
    if (definition.requiresCredential && row.credentials.length === 0) return [];
    return [
      {
        id: row.id,
        key: row.key,
        type: row.type as AiProviderKey,
        autoDisableOnError: row.autoDisableOnError,
        name: row.name,
        priority: row.priority,
        model: row.model,
        baseUrl: row.baseUrl,
        useProxy: row.useProxy,
        credentials: [],
      },
    ];
  });
}

export async function createAiProvider(input: {
  type: AiProviderKey;
  name: string;
  model: string;
  baseUrl: string;
  enabled: boolean;
  useProxy: boolean;
  autoDisableOnError: boolean;
  apiKey?: string;
}) {
  const credentialId = input.apiKey ? randomUUID() : null;
  const encryptedApiKey = input.apiKey
    ? encrypt(input.apiKey, encryptionKey(), credentialSalt(credentialId!))
    : null;
  return db.$transaction(
    async (tx) => {
      const last = await tx.aiProvider.findFirst({
        orderBy: { priority: "desc" },
        select: { priority: true },
      });
      return tx.aiProvider.create({
        data: {
          id: randomUUID(),
          key: `${input.type}-${randomUUID()}`,
          type: input.type,
          name: input.name,
          model: input.model,
          baseUrl: input.baseUrl,
          enabled: input.enabled,
          useProxy: input.useProxy,
          autoDisableOnError: input.autoDisableOnError,
          priority: (last?.priority ?? 0) + 1,
          ...(encryptedApiKey
            ? {
                credentials: {
                  create: {
                    id: credentialId!,
                    label: input.name,
                    encryptedApiKey,
                  },
                },
              }
            : {}),
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function disableAiRoutingProvider(id: string, reason: string): Promise<void> {
  await db.aiProvider.updateMany({
    where: { id, enabled: true, autoDisableOnError: true },
    data: {
      enabled: false,
      disabledAt: new Date(),
      disabledReason: reason.slice(0, 2_000),
      lastTestedAt: new Date(),
      testStatus: "error",
      testMessage: reason.slice(0, 2_000),
    },
  });
}

export async function claimAiRoutingCredentials(
  providerId: string,
  limit = 2,
): Promise<AiRoutingCredential[]> {
  const now = new Date();
  const rows = await db.$transaction(
    async (tx) => {
      const selected = await tx.aiProviderCredential.findMany({
        where: {
          providerId,
          enabled: true,
          authErrorAt: null,
          OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
        },
        orderBy: [{ lastUsedAt: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        take: limit,
      });
      if (selected.length > 0) {
        await Promise.all(
          selected.map((credential, index) =>
            tx.aiProviderCredential.update({
              where: { id: credential.id },
              data: { lastUsedAt: new Date(now.getTime() + index) },
            }),
          ),
        );
      }
      return selected;
    },
    { isolationLevel: "Serializable" },
  );
  const passphrase = rows.length > 0 ? encryptionKey() : null;
  return rows.flatMap((credential) => {
    try {
      return [
        {
          id: credential.id,
          label: credential.label,
          apiKey: decrypt(credential.encryptedApiKey, passphrase!, credentialSalt(credential.id)),
        },
      ];
    } catch (error) {
      log.error({ credentialId: credential.id, error }, "AI credential could not be decrypted");
      return [];
    }
  });
}

export async function getAiRoutingProxy(): Promise<AiRoutingProxy | null> {
  const row = await db.aiProxyConfig.findUnique({ where: { id: PROXY_ID } });
  if (!row?.encryptedPassword) return null;
  const protocol = row.protocol === "https" ? "https" : "http";
  return {
    protocol,
    host: row.host,
    port: row.port,
    username: row.username,
    password: decrypt(row.encryptedPassword, encryptionKey(), "ai-proxy:default"),
  };
}

export async function createAiProviderCredential(input: {
  providerId: string;
  label: string;
  apiKey: string;
}): Promise<string> {
  const id = randomUUID();
  await db.aiProviderCredential.create({
    data: {
      id,
      providerId: input.providerId,
      label: input.label,
      encryptedApiKey: encrypt(input.apiKey, encryptionKey(), credentialSalt(id)),
    },
  });
  return id;
}

export async function replaceAiProviderCredential(
  id: string,
  input: { label?: string; apiKey?: string; enabled?: boolean },
): Promise<void> {
  await db.aiProviderCredential.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.apiKey !== undefined
        ? {
            encryptedApiKey: encrypt(input.apiKey, encryptionKey(), credentialSalt(id)),
            authErrorAt: null,
            cooldownUntil: null,
            lastTestedAt: null,
            testStatus: null,
            testMessage: null,
          }
        : {}),
    },
  });
}

export async function decryptAiProviderCredential(id: string): Promise<string> {
  const row = await db.aiProviderCredential.findUniqueOrThrow({ where: { id } });
  return decrypt(row.encryptedApiKey, encryptionKey(), credentialSalt(id));
}

export async function saveAiProxyConfig(input: {
  protocol: "http" | "https";
  host: string;
  port: number;
  username: string;
  password?: string;
}): Promise<void> {
  await db.aiProxyConfig.upsert({
    where: { id: PROXY_ID },
    create: {
      id: PROXY_ID,
      protocol: input.protocol,
      host: input.host,
      port: input.port,
      username: input.username,
      encryptedPassword: input.password
        ? encrypt(input.password, encryptionKey(), "ai-proxy:default")
        : null,
    },
    update: {
      protocol: input.protocol,
      host: input.host,
      port: input.port,
      username: input.username,
      ...(input.password
        ? { encryptedPassword: encrypt(input.password, encryptionKey(), "ai-proxy:default") }
        : {}),
      lastTestedAt: null,
      testStatus: null,
      testMessage: null,
    },
  });
}

export async function clearAiProxyPassword(): Promise<void> {
  await db.aiProxyConfig.updateMany({
    where: { id: PROXY_ID },
    data: {
      encryptedPassword: null,
      lastTestedAt: null,
      testStatus: null,
      testMessage: null,
    },
  });
}

export async function coolDownAiCredential(id: string, until: Date): Promise<void> {
  await db.aiProviderCredential.updateMany({
    where: { id },
    data: { cooldownUntil: until, testStatus: "cooldown", testMessage: "Rate limited" },
  });
}

export async function quarantineAiCredential(id: string, message: string): Promise<void> {
  await db.aiProviderCredential.updateMany({
    where: { id },
    data: {
      authErrorAt: new Date(),
      lastTestedAt: new Date(),
      testStatus: "error",
      testMessage: message.slice(0, 2_000),
    },
  });
}

export async function recordAiCredentialTest(
  id: string,
  status: "ok" | "error",
  message: string,
): Promise<void> {
  await db.aiProviderCredential.updateMany({
    where: { id },
    data: {
      lastTestedAt: new Date(),
      testStatus: status,
      testMessage: message.slice(0, 2_000),
      ...(status === "ok" ? { authErrorAt: null, cooldownUntil: null } : {}),
    },
  });
}

export async function recordAiProviderTest(
  id: string,
  status: "ok" | "error",
  message: string,
): Promise<void> {
  await db.aiProvider.updateMany({
    where: { id },
    data: {
      lastTestedAt: new Date(),
      testStatus: status,
      testMessage: message.slice(0, 2_000),
    },
  });
}

export async function recordAiProxyTest(status: "ok" | "error", message: string): Promise<void> {
  await db.aiProxyConfig.updateMany({
    where: { id: PROXY_ID },
    data: { lastTestedAt: new Date(), testStatus: status, testMessage: message.slice(0, 2_000) },
  });
}
