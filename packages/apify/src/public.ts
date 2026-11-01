/**
 * Anonymous (unauthenticated) access to public Apify data. Use from the
 * web app's server components to enrich DB records with live titles,
 * stats, pricing, and run history.
 *
 * All three helpers swallow non-404 errors and return `null` so a
 * Promise.all of multiple public lookups never fails-fast on a single
 * bad lookup. They log warnings so silent failures are debuggable.
 *
 * Results are cached in Redis with a 5-minute TTL when REDIS_URL is
 * configured, with a small in-process cache for hot repeated lookups and
 * local development. Cache failures are swallowed and the underlying call
 * remains authoritative.
 */

import { createApifyClient, type ApifyClientWrapper } from "./client";
import type { ApifyActorDetail, ApifyRun, ApifyUserProfile } from "./types";
import { getLogger, BoundedTtlCache, isRedisEnabled } from "@actorconsole/shared";
import IORedis from "ioredis";

let _anon: ApifyClientWrapper | null = null;
const log = getLogger("apify:public");
function anon(): ApifyClientWrapper {
  return (_anon ??= createApifyClient());
}

function toUsernameActor(s: string): { username: string; name: string } | null {
  const match = /^([a-zA-Z0-9][a-zA-Z0-9_.-]{0,99})[~/]([a-zA-Z0-9][a-zA-Z0-9_.-]{0,99})$/.exec(s);
  return match ? { username: match[1]!, name: match[2]! } : null;
}

// ---------------------------------------------------------------------------
// TTL cache
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches audit recommendation

export const PUBLIC_CACHE_MAX_ENTRIES = 1000;
const cache = new BoundedTtlCache<unknown>(PUBLIC_CACHE_MAX_ENTRIES);
const pending = new Map<string, Promise<unknown>>();
let redisCache: IORedis | null | undefined;

/** Sentinel that lives outside the user-provided value space to mark
 *  "no cache entry" without colliding with legitimate null returns. */
const NO_ENTRY = Symbol("no-cache-entry");
type CacheLookup<T> = T | typeof NO_ENTRY | null;

function cacheGet<T>(key: string): CacheLookup<T> {
  const value = cache.get(key);
  return value === undefined ? NO_ENTRY : value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, value, Math.min(ttlMs, DEFAULT_TTL_MS));
}

function getRedisCache(): IORedis | null {
  if (!isRedisEnabled()) return null;
  if (redisCache !== undefined) return redisCache;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisCache = null;
    return null;
  }
  redisCache = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  return redisCache;
}

async function distributedCacheGet<T>(key: string): Promise<T | typeof NO_ENTRY> {
  const local = cacheGet<T>(key);
  if (local !== NO_ENTRY) return local as T;
  const redis = getRedisCache();
  if (!redis) return NO_ENTRY;
  try {
    const raw = await redis.get(`actorconsole:public:${key}`);
    if (raw === null) return NO_ENTRY;
    const value = raw === "\0" ? null : (JSON.parse(raw) as T);
    cacheSet(key, value as T, DEFAULT_TTL_MS);
    return value as T;
  } catch {
    return NO_ENTRY;
  }
}

async function distributedCacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  cacheSet(key, value, ttlMs);
  const redis = getRedisCache();
  if (!redis) return;
  try {
    await redis.set(
      `actorconsole:public:${key}`,
      value === null ? "\0" : JSON.stringify(value),
      "PX",
      ttlMs,
    );
  } catch {
    // Public cache is an optimization; the Apify request remains authoritative.
  }
}

/** Test/diagnostic helper — clear the in-process cache. */
export function clearPublicCache(): void {
  cache.clear();
}

async function lookup<T>(key: string, options: { ttlMs?: number; bypassCache?: boolean }, load: () => Promise<T>): Promise<T | null> {
  const underway = pending.get(key);
  if (underway) return underway as Promise<T>;
  if (pending.size >= 64) return null;
  const operation = (async () => {
    if (!options.bypassCache) {
      const cached = await distributedCacheGet<T>(key);
      if (cached !== NO_ENTRY) return cached as T;
    }
    let result: T | null;
    try { result = await load(); }
    catch (err) { log.warn({ err, key }, "Public lookup failed"); result = null; }
    await distributedCacheSet(key, result, options.ttlMs ?? DEFAULT_TTL_MS);
    return result;
  })();
  pending.set(key, operation);
  try { return await operation; } finally { pending.delete(key); }
}

/** Test/diagnostic helper — how many entries are currently cached. */
export function publicCacheSize(): number {
  return cache.size;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getPublicActor(
  usernameActor: string,
  options: { ttlMs?: number; bypassCache?: boolean } = {},
): Promise<ApifyActorDetail | null> {
  const parts = toUsernameActor(usernameActor);
  if (!parts) return null;
  return lookup(`actor:${parts.username}/${parts.name}`, options,
    () => anon().getActor(`${parts.username}/${parts.name}`));
}

export async function getPublicUser(
  username: string,
  options: { ttlMs?: number; bypassCache?: boolean } = {},
): Promise<ApifyUserProfile | null> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(username)) return null;
  return lookup(`user:${username}`, options, () => anon().getPublicUser(username));
}

export async function getLatestPublicRun(
  usernameActor: string,
  options: { ttlMs?: number; bypassCache?: boolean } = {},
): Promise<ApifyRun | null> {
  const parts = toUsernameActor(usernameActor);
  if (!parts) return null;
  return lookup(`run:${parts.username}/${parts.name}`, options,
    () => anon().getLatestPublicRun(`${parts.username}/${parts.name}`));
}
