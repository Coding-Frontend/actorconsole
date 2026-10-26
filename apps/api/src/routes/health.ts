import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getRedis } from "../lib/queue.js";

type CheckStatus = "ok" | "fail" | "skipped";

interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
}

interface ReadinessReport {
  ok: boolean;
  data: {
    ready: boolean;
    timestamp: string;
    checks: {
      db: CheckResult;
      redis: CheckResult;
    };
  };
}

/**
 * Pings a promise-returning function with a hard timeout. Returns
 * a CheckResult instead of throwing so the /ready endpoint always
 * returns a structured response.
 */
async function withTimeout(
  label: string,
  fn: () => Promise<unknown>,
  timeoutMs: number,
): Promise<CheckResult> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `${label}_unavailable`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const healthRoutes = new Hono<AppEnv>()
  .get("/", (c) =>
    c.json({
      ok: true,
      data: {
        service: "actorconsole-api",
        version: "0.0.0",
        env: process.env.NODE_ENV ?? "development",
        uptimeSec: Math.floor(process.uptime()),
      },
    }),
  )
  /**
   * Readiness probe. Pings Postgres and Redis with short timeouts
   * and returns 200 if both are healthy, 503 otherwise. Designed
   * for k8s liveness/readiness, AWS ELB, and uptime monitors.
   */
  .get("/ready", async (c) => {
    const { db } = await import("@actorconsole/db");
    const redis = getRedis();

    const [dbCheck, redisCheck] = await Promise.all([
      withTimeout(
        "db",
        async () => {
          await db.$queryRaw`SELECT 1`;
        },
        2000,
      ),
      redis
        ? withTimeout("redis", async () => ({ pong: await redis.ping() }), 2000)
        : Promise.resolve<CheckResult>({ status: "skipped" }),
    ]);

    const ready = dbCheck.status === "ok" && redisCheck.status !== "fail";
    const report: ReadinessReport = {
      ok: ready,
      data: {
        ready,
        timestamp: new Date().toISOString(),
        checks: { db: dbCheck, redis: redisCheck },
      },
    };

    return c.json(report, ready ? 200 : 503);
  });
