import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";
import {
  assertApiKeyActorScope,
  assertApiKeyCapability,
  assertApiKeyUnscoped,
  requireApiKeyMethodScope,
  requireApiKeyMethodCapability,
  requireApiKeyScope,
} from "../../src/middleware/api-key-scope.js";

function buildApp(session: Record<string, unknown>) {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.use("*", async (c, next) => {
    c.set("session", session as never);
    await next();
  });
  app.use("/read", requireApiKeyMethodScope());
  app.use("/write", requireApiKeyMethodScope());
  app.use("/granular-read", requireApiKeyMethodScope({ allowGranularMcp: true }));
  app.use("/granular-write", requireApiKeyMethodScope({ allowGranularMcp: true }));
  app.use("/capability-write", requireApiKeyMethodCapability("actors:read", "actors:write"));
  app.use("/mcp", requireApiKeyScope("mcp"));
  app.get("/read", (c) => c.json({ ok: true }));
  app.post("/write", (c) => c.json({ ok: true }));
  app.get("/granular-read", (c) => c.json({ ok: true }));
  app.post("/granular-write", (c) => c.json({ ok: true }));
  app.post("/capability-write", (c) => c.json({ ok: true }));
  app.get("/mcp", (c) => c.json({ ok: true }));
  return app;
}

describe("API-key scope enforcement", () => {
  it("allows the selected read and write scopes", async () => {
    const app = buildApp({ authMethod: "api-key", apiKeyScopes: ["read", "write"] });
    expect((await app.request("/read")).status).toBe(200);
    expect((await app.request("/write", { method: "POST" })).status).toBe(200);
  });

  it("defers legacy method authorization for granular MCP credentials", async () => {
    const app = buildApp({ authMethod: "api-key", apiKeyScopes: ["mcp", "actors:read"] });
    expect((await app.request("/read")).status).toBe(403);
    expect((await app.request("/write", { method: "POST" })).status).toBe(403);
    expect((await app.request("/granular-read")).status).toBe(200);
    expect((await app.request("/granular-write", { method: "POST" })).status).toBe(200);
    expect((await app.request("/capability-write", { method: "POST" })).status).toBe(403);
  });

  it("rejects a method outside the key's scopes and allows session auth", async () => {
    const readOnly = buildApp({ authMethod: "api-key", apiKeyScopes: ["read"] });
    expect((await readOnly.request("/write", { method: "POST" })).status).toBe(403);
    const session = buildApp({ authMethod: "session", apiKeyScopes: ["read"] });
    expect((await session.request("/write", { method: "POST" })).status).toBe(200);
  });

  it("enforces MCP scope and actor restrictions", async () => {
    const app = buildApp({ authMethod: "api-key", apiKeyScopes: ["read"], apiKeyActorIds: ["a1"] });
    expect((await app.request("/mcp")).status).toBe(403);
    expect(() => assertApiKeyActorScope(appSession("a1", ["a1"]), "a1")).not.toThrow();
    expect(() => assertApiKeyActorScope(appSession("a1", ["a1"]), "a2")).toThrow(
      "not scoped to this actor",
    );
    expect(() => assertApiKeyUnscoped(appSession("a1", ["a1"]))).toThrow(
      "without an actor restriction",
    );
  });

  it("enforces granular capabilities while preserving legacy MCP credentials", () => {
    expect(() =>
      assertApiKeyCapability(
        appSessionWithScopes(["read", "write", "mcp", "actors:read"]),
        "actors:read",
      ),
    ).not.toThrow();
    expect(() =>
      assertApiKeyCapability(
        appSessionWithScopes(["read", "write", "mcp", "actors:read"]),
        "actors:write",
      ),
    ).toThrow("does not include the actors:write permission");
    expect(() =>
      assertApiKeyCapability(appSessionWithScopes(["read", "write", "mcp"]), "actors:write"),
    ).not.toThrow();
  });
});

function appSession(userId: string, actorIds: string[]) {
  return {
    userId,
    email: "test@example.com",
    plan: "PRO",
    authMethod: "api-key" as const,
    apiKeyActorIds: actorIds,
  };
}

function appSessionWithScopes(scopes: Array<"read" | "write" | "mcp" | "actors:read">) {
  return {
    userId: "u1",
    email: "test@example.com",
    plan: "PRO" as const,
    authMethod: "api-key" as const,
    apiKeyScopes: scopes,
  };
}
