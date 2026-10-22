import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  clearAiProxyPassword,
  createAiProvider,
  createAiProviderCredential,
  db,
  decryptAiProviderCredential,
  getAiRoutingProxy,
  recordAiCredentialTest,
  recordAiProviderTest,
  recordAiProxyTest,
  replaceAiProviderCredential,
  saveAiProxyConfig,
  type AiRoutingCredential,
  type AiRoutingProvider,
} from "@actorconsole/db";
import {
  AI_PROVIDER_BY_KEY,
  AI_PROVIDER_KEYS,
  isAiProviderKey,
  type AiProviderKey,
} from "@actorconsole/shared";
import { testAiProviderConnection, testAiProxyConnection } from "@actorconsole/ai";
import { requireAdmin } from "../middleware/admin.js";
import type { AppEnv } from "../app.js";

const providerUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    enabled: z.boolean().optional(),
    autoDisableOnError: z.boolean().optional(),
    model: z.string().trim().min(1).max(191).optional(),
    baseUrl: z.string().url().max(1_000).optional(),
    useProxy: z.boolean().optional(),
  })
  .strict();

const providerCreateSchema = z
  .object({
    type: z.enum(AI_PROVIDER_KEYS),
    name: z.string().trim().min(1).max(128),
    model: z.string().trim().min(1).max(191).optional(),
    baseUrl: z.string().url().max(1_000).optional(),
    enabled: z.boolean().default(false),
    useProxy: z.boolean().default(false),
    autoDisableOnError: z.boolean().default(true),
    apiKey: z.string().trim().min(8).max(20_000).optional(),
  })
  .strict();

const reorderSchema = z
  .object({ keys: z.array(z.string().min(1).max(64)).min(1).max(1_000) })
  .strict()
  .refine((body) => new Set(body.keys).size === body.keys.length, {
    message: "Each AI provider must appear exactly once",
  });

const credentialCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(191),
    apiKey: z.string().trim().min(8).max(20_000),
  })
  .strict();

const credentialUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(191).optional(),
    apiKey: z.string().trim().min(8).max(20_000).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "No changes supplied" });

const proxyUpdateSchema = z
  .object({
    protocol: z.enum(["http", "https"]),
    host: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z0-9.-]+$/),
    port: z.number().int().min(1).max(65_535),
    username: z.string().trim().min(1).max(500),
    password: z.string().min(1).max(20_000).optional(),
    clearPassword: z.boolean().optional(),
  })
  .strict()
  .refine((body) => !(body.password && body.clearPassword), {
    message: "Set or clear the proxy password, not both",
  });

async function audit(c: any, action: string, resource: string, after: unknown) {
  const admin = c.get("adminSession" as any);
  if (!admin) return;
  await db.auditLog.create({
    data: {
      adminId: admin.viaApiKey ? null : admin.adminId,
      action,
      resource,
      before: undefined,
      after: after as any,
      ip: c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      source: admin.viaApiKey ? "api-key" : "ui",
    },
  });
}

function validKey(c: any): string | Response {
  const key = c.req.param("key");
  return typeof key === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(key)
    ? key
    : c.json({ ok: false, error: { code: "not_found", message: "AI provider not found." } }, 404);
}

async function readiness(provider: {
  type: string;
  useProxy: boolean;
  credentials: Array<{ enabled: boolean; authErrorAt: Date | null }>;
}) {
  const definition = AI_PROVIDER_BY_KEY[provider.type as AiProviderKey];
  const proxy = provider.useProxy
    ? await db.aiProxyConfig.findUnique({ where: { id: "default" } })
    : null;
  const credentialCount = provider.credentials.filter(
    (credential) => credential.enabled && !credential.authErrorAt,
  ).length;
  const credentialReady =
    Boolean(definition) && (!definition.requiresCredential || credentialCount > 0);
  const proxyReady = !provider.useProxy || Boolean(proxy?.encryptedPassword);
  return { ready: credentialReady && proxyReady, credentialReady, proxyReady, credentialCount };
}

async function runtimeProvider(
  key: string,
  credentialId?: string,
): Promise<{ provider: AiRoutingProvider; credential: AiRoutingCredential | null }> {
  const row = await db.aiProvider.findUniqueOrThrow({
    where: { key },
    include: { credentials: { orderBy: { createdAt: "asc" } } },
  });
  if (!isAiProviderKey(row.type)) throw new Error("Unsupported AI provider type");
  const definition = AI_PROVIDER_BY_KEY[row.type];
  const credentialRow = credentialId
    ? row.credentials.find((credential) => credential.id === credentialId)
    : row.credentials.find((credential) => credential.enabled);
  if (definition.requiresCredential && !credentialRow)
    throw new Error("No enabled API key configured");
  const credential = credentialRow
    ? {
        id: credentialRow.id,
        label: credentialRow.label,
        apiKey: await decryptAiProviderCredential(credentialRow.id),
      }
    : null;
  return {
    provider: {
      id: row.id,
      key,
      type: row.type,
      autoDisableOnError: row.autoDisableOnError,
      name: row.name,
      priority: row.priority,
      model: row.model,
      baseUrl: row.baseUrl,
      useProxy: row.useProxy,
      credentials: credential ? [credential] : [],
    },
    credential,
  };
}

export const adminAiProviderRoutes = new Hono<AppEnv>()
  .use("*", requireAdmin())
  .get("/", async (c) => {
    const [providers, proxy] = await Promise.all([
      db.aiProvider.findMany({
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        include: { credentials: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      }),
      db.aiProxyConfig.findUnique({ where: { id: "default" } }),
    ]);
    const data = await Promise.all(
      providers.map(async (provider) => ({
        id: provider.id,
        key: provider.key,
        type: provider.type,
        autoDisableOnError: provider.autoDisableOnError,
        disabledAt: provider.disabledAt,
        disabledReason: provider.disabledReason,
        name: provider.name,
        enabled: provider.enabled,
        priority: provider.priority,
        model: provider.model,
        baseUrl: provider.baseUrl,
        useProxy: provider.useProxy,
        lastTestedAt: provider.lastTestedAt,
        testStatus: provider.testStatus,
        testMessage: provider.testMessage,
        updatedAt: provider.updatedAt,
        readiness: await readiness(provider),
        credentials: provider.credentials.map((credential) => ({
          id: credential.id,
          label: credential.label,
          enabled: credential.enabled,
          isConfigured: true,
          lastUsedAt: credential.lastUsedAt,
          cooldownUntil: credential.cooldownUntil,
          authErrorAt: credential.authErrorAt,
          lastTestedAt: credential.lastTestedAt,
          testStatus: credential.testStatus,
          testMessage: credential.testMessage,
          updatedAt: credential.updatedAt,
        })),
      })),
    );
    return c.json({
      ok: true,
      data: {
        providers: data,
        proxy: {
          protocol: proxy?.protocol ?? "http",
          host: proxy?.host ?? "",
          port: proxy?.port ?? 8080,
          username: proxy?.username ?? "",
          passwordConfigured: Boolean(proxy?.encryptedPassword),
          lastTestedAt: proxy?.lastTestedAt ?? null,
          testStatus: proxy?.testStatus ?? null,
          testMessage: proxy?.testMessage ?? null,
        },
      },
    });
  })
  .post("/", zValidator("json", providerCreateSchema), async (c) => {
    const { apiKey, ...settings } = c.req.valid("json");
    const definition = AI_PROVIDER_BY_KEY[settings.type];
    if (settings.enabled && definition.requiresCredential && !apiKey) {
      return c.json(
        {
          ok: false,
          error: {
            code: "ai_provider_not_ready",
            message: "Add an API key before enabling this provider.",
          },
        },
        409,
      );
    }
    if (settings.enabled && settings.useProxy) {
      const proxy = await db.aiProxyConfig.findUnique({ where: { id: "default" } });
      if (!proxy?.encryptedPassword) {
        return c.json(
          {
            ok: false,
            error: {
              code: "ai_provider_not_ready",
              message: "Configure the shared proxy password before enabling proxy routing.",
            },
          },
          409,
        );
      }
    }
    const provider = await createAiProvider({
      ...settings,
      model: settings.model ?? definition.model,
      baseUrl: settings.baseUrl ?? definition.baseUrl,
      ...(apiKey ? { apiKey } : {}),
    });
    await audit(c, "ai_provider.create", `ai_provider:${provider.key}`, {
      ...settings,
      key: provider.key,
      apiKeyConfigured: Boolean(apiKey),
    });
    return c.json({ ok: true, data: { id: provider.id, key: provider.key } }, 201);
  })
  .put("/proxy", zValidator("json", proxyUpdateSchema), async (c) => {
    const body = c.req.valid("json");
    const existing = await db.aiProxyConfig.findUnique({ where: { id: "default" } });
    await saveAiProxyConfig(body);
    if (body.clearPassword) await clearAiProxyPassword();
    const passwordConfigured = body.clearPassword
      ? false
      : Boolean(body.password || existing?.encryptedPassword);
    await audit(c, "ai_proxy.update", "ai_proxy:default", {
      protocol: body.protocol,
      host: body.host,
      port: body.port,
      username: body.username,
      passwordConfigured,
    });
    return c.json({ ok: true, data: { passwordConfigured } });
  })
  .post("/proxy/test", async (c) => {
    try {
      const proxy = await getAiRoutingProxy();
      if (!proxy) throw new Error("Proxy password is not configured");
      const message = await testAiProxyConnection(proxy);
      await recordAiProxyTest("ok", message);
      return c.json({ ok: true, data: { status: "ok", message } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordAiProxyTest("error", message);
      return c.json({ ok: false, error: { code: "proxy_test_failed", message } }, 502);
    }
  })
  .put("/reorder", zValidator("json", reorderSchema), async (c) => {
    const { keys } = c.req.valid("json");
    const reordered = await db.$transaction(
      async (tx) => {
        const existing = await tx.aiProvider.findMany({ select: { key: true } });
        const existingKeys = new Set(existing.map((provider) => provider.key));
        if (keys.length !== existing.length || keys.some((key) => !existingKeys.has(key)))
          return false;
        for (const [index, key] of keys.entries()) {
          await tx.aiProvider.update({ where: { key }, data: { priority: index + 1 } });
        }
        return true;
      },
      { isolationLevel: "Serializable" },
    );
    if (!reordered)
      return c.json(
        {
          ok: false,
          error: {
            code: "ai_provider_order_changed",
            message: "The provider list changed. Refresh it before sorting again.",
          },
        },
        409,
      );
    await audit(c, "ai_provider.reorder", "ai_provider:all", { keys });
    return c.json({ ok: true, data: { keys } });
  })
  .put("/:key", zValidator("json", providerUpdateSchema), async (c) => {
    const key = validKey(c);
    if (key instanceof Response) return key;
    const body = c.req.valid("json");
    const current = await db.aiProvider.findUnique({
      where: { key },
      include: { credentials: true },
    });
    if (!current) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const nextEnabled = body.enabled ?? current.enabled;
    if (nextEnabled) {
      const next = { ...current, useProxy: body.useProxy ?? current.useProxy };
      const state = await readiness(next);
      if (!state.ready) {
        return c.json(
          {
            ok: false,
            error: {
              code: "ai_provider_not_ready",
              message: !state.credentialReady
                ? "Add and enable an API key before enabling this provider."
                : "Configure the shared proxy password before enabling proxy routing.",
            },
          },
          409,
        );
      }
    }
    const updated = await db.aiProvider.update({
      where: { key },
      data: {
        ...body,
        ...(body.enabled === true ? { disabledAt: null, disabledReason: null } : {}),
        lastTestedAt: null,
        testStatus: null,
        testMessage: null,
      },
    });
    await audit(c, "ai_provider.update", `ai_provider:${key}`, body);
    return c.json({ ok: true, data: updated });
  })
  .delete("/:key", async (c) => {
    const key = validKey(c);
    if (key instanceof Response) return key;
    const deleted = await db.aiProvider.deleteMany({ where: { key } });
    if (!deleted.count) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    await audit(c, "ai_provider.delete", `ai_provider:${key}`, { key });
    return c.json({ ok: true, data: { key, deleted: true } });
  })
  .post("/:key/test", async (c) => {
    const key = validKey(c);
    if (key instanceof Response) return key;
    const row = await db.aiProvider.findUnique({ where: { key } });
    if (!row) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    try {
      const { provider, credential } = await runtimeProvider(key);
      const proxy = provider.useProxy ? await getAiRoutingProxy() : null;
      if (provider.useProxy && !proxy) throw new Error("Proxy password is not configured");
      const message = await testAiProviderConnection(provider, credential, proxy);
      if (credential) await recordAiCredentialTest(credential.id, "ok", message);
      await recordAiProviderTest(row.id, "ok", message);
      return c.json({ ok: true, data: { status: "ok", message } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordAiProviderTest(row.id, "error", message);
      return c.json({ ok: false, error: { code: "provider_test_failed", message } }, 502);
    }
  })
  .post("/:key/credentials", zValidator("json", credentialCreateSchema), async (c) => {
    const key = validKey(c);
    if (key instanceof Response) return key;
    const provider = await db.aiProvider.findUnique({ where: { key } });
    if (!provider) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const body = c.req.valid("json");
    const id = await createAiProviderCredential({ providerId: provider.id, ...body });
    await audit(c, "ai_provider_credential.create", `ai_provider:${key}:credential:${id}`, {
      id,
      label: body.label,
    });
    return c.json({ ok: true, data: { id, label: body.label, isConfigured: true } }, 201);
  })
  .put("/:key/credentials/:credentialId", zValidator("json", credentialUpdateSchema), async (c) => {
    const key = validKey(c);
    if (key instanceof Response) return key;
    const credentialId = c.req.param("credentialId");
    const credential = await db.aiProviderCredential.findFirst({
      where: { id: credentialId, provider: { key } },
    });
    if (!credential) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    const body = c.req.valid("json");
    await replaceAiProviderCredential(credentialId, body);
    await audit(
      c,
      "ai_provider_credential.update",
      `ai_provider:${key}:credential:${credentialId}`,
      { label: body.label, enabled: body.enabled, apiKeyReplaced: body.apiKey !== undefined },
    );
    return c.json({ ok: true, data: { id: credentialId, isConfigured: true } });
  })
  .delete("/:key/credentials/:credentialId", async (c) => {
    const key = validKey(c);
    if (key instanceof Response) return key;
    const credentialId = c.req.param("credentialId");
    const deleted = await db.aiProviderCredential.deleteMany({
      where: { id: credentialId, provider: { key } },
    });
    if (!deleted.count) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    await audit(
      c,
      "ai_provider_credential.delete",
      `ai_provider:${key}:credential:${credentialId}`,
      { deleted: true },
    );
    return c.json({ ok: true, data: { id: credentialId, deleted: true } });
  })
  .post("/:key/credentials/:credentialId/test", async (c) => {
    const key = validKey(c);
    if (key instanceof Response) return key;
    const credentialId = c.req.param("credentialId");
    const exists = await db.aiProviderCredential.findFirst({
      where: { id: credentialId, provider: { key } },
    });
    if (!exists) return c.json({ ok: false, error: { code: "not_found" } }, 404);
    try {
      const { provider, credential } = await runtimeProvider(key, credentialId);
      const proxy = provider.useProxy ? await getAiRoutingProxy() : null;
      if (provider.useProxy && !proxy) throw new Error("Proxy password is not configured");
      const message = await testAiProviderConnection(provider, credential, proxy);
      await recordAiCredentialTest(credentialId, "ok", message);
      return c.json({ ok: true, data: { status: "ok", message } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordAiCredentialTest(credentialId, "error", message);
      return c.json({ ok: false, error: { code: "credential_test_failed", message } }, 502);
    }
  });
