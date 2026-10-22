/**
 * Tiny Redis-or-memory cache helper.
 *
 * - When Redis is configured, values are stored in Redis with a TTL.
 *   This makes the cache effective across multiple API instances.
 * - When Redis is NOT configured, values are stored in an in-process
 *   Map. The semantics are the same (read returns the cached value or
 *   null, write stores with TTL), just per-instance.
 *
 * All failures are swallowed: a cache miss or write failure must never
 * break a request. The original loader is always called as the source
 * of truth.
 */

import { getRedis } from "./queue.js";

const CACHE_COMMAND_TIMEOUT_MS = 750;

function withTimeout<T>(promise: Promise<T>, timeoutMs = CACHE_COMMAND_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Redis command timed out")), timeoutMs);
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

const memory = new Map<string, { value: unknown; expiresAt: number }>();

function memoryGet<T>(key: string): T | undefined {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    memory.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function memorySet<T>(key: string, value: T, ttlMs: number): void {
  memory.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Look up a cached value. Returns:
 *  - the cached value on hit (possibly null when the loader returned null)
 *  - the CACHE_MISS sentinel on miss
 */
export const CACHE_MISS = Symbol("cache-miss");
export type CacheResult<T> = T | typeof CACHE_MISS;

export interface CacheGetOptions {
  /** TTL in seconds when writing to Redis. */
  ttlSeconds: number;
}

export async function cacheGet<T>(key: string): Promise<CacheResult<T>> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await withTimeout(redis.get(key));
      if (raw === null) return CACHE_MISS;
      // We store null as the literal string "\0" so a deserialised JSON
      // `null` round-trips correctly. Anything else is JSON.
      if (raw === "\0") return null as T;
      return JSON.parse(raw) as T;
    } catch {
      // Treat any Redis read error as a miss; the loader will refill.
      return CACHE_MISS;
    }
  }
  const fromMem = memoryGet<T>(key);
  if (fromMem === undefined) return CACHE_MISS;
  return fromMem as T;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const payload = value === null ? "\0" : JSON.stringify(value);
      await withTimeout(redis.set(key, payload, "EX", ttlSeconds));
      return;
    } catch {
      // Fall through to in-memory if Redis write fails.
    }
  }
  memorySet(key, value, ttlSeconds * 1000);
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await withTimeout(redis.del(key));
    } catch {
      // ignore
    }
  }
  memory.delete(key);
}

/**
 * Convenience wrapper. If the cached value exists, return it.
 * Otherwise, call the loader, store the result, and return it.
 *
 * On Redis or memory errors, the loader is still called and its
 * value is returned. Caching is best-effort, not a correctness
 * boundary.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== CACHE_MISS) return hit as T;
  const value = await loader();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

/** Test/diagnostic — clear the in-memory portion of the cache. */
export function clearMemoryCache(): void {
  memory.clear();
}
