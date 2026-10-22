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
import { getLogger } from "@actorconsole/shared";
import IORedis from "ioredis";

let _anon: ApifyClientWrapper | null = null;
const log = getLogger("apify:public");
function anon(): ApifyClientWrapper {
  return (_anon ??= createApifyClient());
}

function toUsernameActor(s: string): { username: string; name: string } | null {
  const [username, name] = s.split(/[~/]/);
  if (!username || !name) return null;
  return { username, name };
}

// ---------------------------------------------------------------------------
// TTL cache
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches audit recommendation

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
let redisCache: IORedis | null | undefined;

/** Sentinel that lives outside the user-provided value space to mark
 *  "no cache entry" without colliding with legitimate null returns. */
const NO_ENTRY = Symbol("no-cache-entry");
type CacheLookup<T> = T | typeof NO_ENTRY | null;

function cacheGet<T>(key: string): CacheLookup<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return NO_ENTRY;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return NO_ENTRY;
  }
  return entry.value;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function getRedisCache(): IORedis | null {
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
  const key = `actor:${usernameActor}`;
  if (!options.bypassCache) {
    const cached = await distributedCacheGet<ApifyActorDetail | null>(key);
    if (cached !== NO_ENTRY) return cached as ApifyActorDetail | null;
  }
  const parts = toUsernameActor(usernameActor);
  if (!parts) return null;
  let result: ApifyActorDetail | null = null;
  try {
    result = await anon().getActor(`${parts.username}/${parts.name}`);
  } catch (err) {
    log.warn({ err, actor: usernameActor }, "Public actor lookup failed");
    result = null;
  }
  // Cache the result (even null) for the TTL window so a transient
  // outage doesn't cause N identical retries.
  await distributedCacheSet(key, result, options.ttlMs ?? DEFAULT_TTL_MS);
  return result;
}

export async function getPublicUser(
  username: string,
  options: { ttlMs?: number; bypassCache?: boolean } = {},
): Promise<ApifyUserProfile | null> {
  if (!username) return null;
  const key = `user:${username}`;
  if (!options.bypassCache) {
    const cached = await distributedCacheGet<ApifyUserProfile | null>(key);
    if (cached !== NO_ENTRY) return cached as ApifyUserProfile | null;
  }
  let result: ApifyUserProfile | null = null;
  try {
    result = await anon().getPublicUser(username);
  } catch (err) {
    log.warn({ err, username }, "Public user lookup failed");
    result = null;
  }
  await distributedCacheSet(key, result, options.ttlMs ?? DEFAULT_TTL_MS);
  return result;
}

export async function getLatestPublicRun(
  usernameActor: string,
  options: { ttlMs?: number; bypassCache?: boolean } = {},
): Promise<ApifyRun | null> {
  const parts = toUsernameActor(usernameActor);
  if (!parts) return null;
  const key = `run:${usernameActor}`;
  if (!options.bypassCache) {
    const cached = await distributedCacheGet<ApifyRun | null>(key);
    if (cached !== NO_ENTRY) return cached as ApifyRun | null;
  }
  let result: ApifyRun | null = null;
  try {
    result = await anon().getLatestPublicRun(`${parts.username}/${parts.name}`);
  } catch (err) {
    log.warn({ err, actor: usernameActor }, "Public run lookup failed");
    result = null;
  }
  await distributedCacheSet(key, result, options.ttlMs ?? DEFAULT_TTL_MS);
  return result;
}
