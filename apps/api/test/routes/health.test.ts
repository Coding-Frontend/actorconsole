import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module before importing the route
const mockDbQueryRaw = vi.fn();
vi.mock("@actorconsole/db", () => ({
  db: {
    $queryRaw: (...args: unknown[]) => mockDbQueryRaw(...args),
  },
}));

const mockRedisPing = vi.fn();
const mockRedis = { ping: () => mockRedisPing() };
vi.mock("../../src/lib/queue.js", () => ({
  getRedis: () => mockRedis,
}));

import { healthRoutes } from "../../src/routes/health.js";

function buildApp() {
  const app = new Hono();
  app.route("/", healthRoutes);
  return app;
}

describe("GET /ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 ready when DB and Redis are healthy", async () => {
    mockDbQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockRedisPing.mockResolvedValueOnce("PONG");

    const app = buildApp();
    const res = await app.request("/ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.ready).toBe(true);
    expect(body.data.checks.db.status).toBe("ok");
    expect(body.data.checks.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.data.checks.redis.status).toBe("ok");
    expect(body.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns 503 not ready when DB ping fails", async () => {
    mockDbQueryRaw.mockRejectedValueOnce(new Error("DIAGNOSTIC_CANARY /private/client.ts SQL SELECT"));
    mockRedisPing.mockResolvedValueOnce("PONG");

    const app = buildApp();
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.data.ready).toBe(false);
    expect(body.data.checks.db.status).toBe("fail");
    expect(body.data.checks.db.error).toBe("db_unavailable");
    expect(JSON.stringify(body)).not.toContain("DIAGNOSTIC_CANARY");
    expect(JSON.stringify(body)).not.toContain("/private/");
    expect(body.data.checks.redis.status).toBe("ok");
  });

  it("returns 503 not ready when Redis ping fails", async () => {
    mockDbQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    mockRedisPing.mockRejectedValueOnce(new Error("DIAGNOSTIC_CANARY redis://private-host"));

    const app = buildApp();
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.data.checks.redis.status).toBe("fail");
    expect(body.data.checks.redis.error).toBe("redis_unavailable");
    expect(JSON.stringify(body)).not.toContain("DIAGNOSTIC_CANARY");
  });

  it("returns 503 with timeout error when DB ping hangs", async () => {
    // Never resolves within the 2s timeout
    mockDbQueryRaw.mockImplementationOnce(
      () => new Promise(() => {}) as unknown as Promise<unknown>,
    );
    mockRedisPing.mockResolvedValueOnce("PONG");

    const app = buildApp();
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.data.checks.db.status).toBe("fail");
    expect(body.data.checks.db.error).toBe("db_unavailable");
  });

  it("returns 200 ready when Redis is skipped (no REDIS_URL)", async () => {
    // Override the mocked getRedis to return null
    vi.doMock("../../src/lib/queue.js", () => ({
      getRedis: () => null,
    }));
    mockDbQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    // Re-import the module under the new mock
    vi.resetModules();
    const { healthRoutes: routes } = await import("../../src/routes/health.js");
    const app = new Hono().route("/", routes);
    const res = await app.request("/ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.checks.redis.status).toBe("skipped");
    expect(body.data.checks.db.status).toBe("ok");
  });
});

describe("GET /", () => {
  it("returns service metadata", async () => {
    const app = buildApp();
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.service).toBe("actorconsole-api");
    expect(typeof body.data.uptimeSec).toBe("number");
  });
});
