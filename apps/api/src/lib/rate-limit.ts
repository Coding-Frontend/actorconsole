/**
 * Rate limiter for API routes. Uses Redis when available (multi-instance safe),
 * falls back to in-memory Map when Redis isn't configured (local dev).
 *
 * The Redis implementation uses a sorted set per key with scores = timestamps.
 * We drop entries outside the window, count remaining, and add the new entry.
 *
 * The in-memory fallback uses a Map<string, number[]> with the same sliding
 * window logic — identical semantics, just not shared across instances.
 */

import { getRedis } from "./queue.js";

const FALLBACK_PREFIX = "rl:";
const REDIS_RATE_LIMIT_TIMEOUT_MS = 750;
const buckets = new Map<string, number[]>();

function withTimeout<T>(promise: Promise<T>, timeoutMs = REDIS_RATE_LIMIT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Redis rate-limit command timed out")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface RateLimitOptions {
  /** Label for error messages. */
  label?: string;
  /** Time window in milliseconds. */
  windowMs: number;
  /** Maximum requests per window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Rate check using Redis (if available) or in-memory fallback.
 * Call from your route handler; if `!allowed`, return 429.
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - opts.windowMs;

  // Try Redis first
  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = `${FALLBACK_PREFIX}${key}`;
      const script = `
        redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[1])
        local count = redis.call("ZCARD", KEYS[1])
        if count >= tonumber(ARGV[2]) then
          local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
          redis.call("PEXPIRE", KEYS[1], ARGV[3])
          return {0, count, oldest[2] or ARGV[1]}
        end
        redis.call("ZADD", KEYS[1], ARGV[4], ARGV[5])
        redis.call("PEXPIRE", KEYS[1], ARGV[3])
        return {1, count + 1, 0}
      `;
      const result = (await withTimeout(
        redis.eval(
          script,
          1,
          redisKey,
          windowStart,
          opts.max,
          opts.windowMs,
          now,
          `${now}-${Math.random()}`,
        ),
      )) as [number, number, number];
      const allowed = Number(result[0]) === 1;
      const count = Number(result[1]);
      if (!allowed) {
        const oldestTs = Number(result[2]) || windowStart;
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: opts.windowMs - (now - oldestTs),
        };
      }
      return {
        allowed: true,
        remaining: Math.max(opts.max - count, 0),
        retryAfterMs: 0,
      };
    } catch {
      if (process.env.NODE_ENV === "production") {
        return { allowed: false, remaining: 0, retryAfterMs: opts.windowMs };
      }
    }
  }

  if (process.env.NODE_ENV === "production") {
    return { allowed: false, remaining: 0, retryAfterMs: opts.windowMs };
  }

  // In-memory fallback
  let arr = buckets.get(key) ?? [];
  arr = arr.filter((t) => now - t < opts.windowMs);
  if (arr.length >= opts.max) {
    const oldest = arr[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: opts.windowMs - (now - oldest),
    };
  }
  arr.push(now);
  buckets.set(key, arr);
  return {
    allowed: true,
    remaining: opts.max - arr.length - 1,
    retryAfterMs: 0,
  };
}

/**
 * Small periodic cleanup so buckets don't leak memory.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of buckets) {
    const fresh = arr.filter((t) => now - t < 3_600_000); // 1 hour
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}, 600_000); // every 10 min
