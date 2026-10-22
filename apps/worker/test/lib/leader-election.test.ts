import { describe, it, expect, beforeEach, vi } from "vitest";
import { createLeaderLock } from "../../src/lib/leader-election.js";
import type IORedis from "ioredis";

/**
 * The mock uses real Date.now() for TTL bookkeeping so we can advance
 * time by simply waiting. We intentionally do NOT use vi.useFakeTimers
 * because ioredis's `set` doesn't read from fake timers — only the
 * sleep does — which would desync the two clocks.
 */

/**
 * Tests for the Redis-based leader lock (Phase 1.5).
 *
 * Uses a real in-memory Redis stub. We do NOT mock ioredis globally
 * because we want to verify the actual SET NX EX command shape.
 */

type RedisStore = Map<string, { value: string; expiresAt: number }>;

function makeMockRedis(): IORedis {
  const store: RedisStore = new Map();

  const client = {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      // Parse "EX <seconds>" and "NX" flags. ioredis passes EX/PX TTL
      // values as numbers (or strings), so accept both.
      let ttlSec: number | undefined;
      let nx = false;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "EX") {
          ttlSec = Number(args[i + 1]);
          i++;
        } else if (a === "PX") {
          ttlSec = Number(args[i + 1]) / 1000;
          i++;
        } else if (a === "NX") {
          nx = true;
        }
      }
      // Honour expiry
      if (store.has(key)) {
        const e = store.get(key)!;
        if (e.expiresAt < Date.now()) store.delete(key);
      }
      if (nx && store.has(key)) return null;
      store.set(key, {
        value,
        expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : Number.POSITIVE_INFINITY,
      });
      return "OK";
    }),
    get: vi.fn(async (key: string) => {
      const e = store.get(key);
      if (!e) return null;
      if (e.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return e.value;
    }),
    del: vi.fn(async (key: string) => {
      const had = store.delete(key);
      return had ? 1 : 0;
    }),
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, expectedToken: string) => {
      const e = store.get(key);
      if (e && e.value === expectedToken && e.expiresAt >= Date.now()) {
        store.delete(key);
        return 1;
      }
      return 0;
    }),
  } as unknown as IORedis;

  return client;
}

describe("leader-election", () => {
  let redis: IORedis;
  beforeEach(() => {
    redis = makeMockRedis();
  });

  it("acquires the lock when free", async () => {
    const lock = createLeaderLock("test:lock", 10);
    expect(await lock.tryAcquire(redis)).toBe(true);
  });

  it("fails to acquire when already held", async () => {
    const lock1 = createLeaderLock("test:lock", 10);
    const lock2 = createLeaderLock("test:lock", 10);
    expect(await lock1.tryAcquire(redis)).toBe(true);
    expect(await lock2.tryAcquire(redis)).toBe(false);
  });

  it("can re-acquire after release", async () => {
    const lock = createLeaderLock("test:lock", 10);
    expect(await lock.tryAcquire(redis)).toBe(true);
    expect(await lock.release(redis)).toBe(true);
    expect(await lock.tryAcquire(redis)).toBe(true);
  });

  it("release is a no-op when not held by us", async () => {
    const lock1 = createLeaderLock("test:lock", 10);
    const lock2 = createLeaderLock("test:lock", 10);
    await lock1.tryAcquire(redis);
    expect(await lock2.release(redis)).toBe(false);
  });

  it("release after expiry does not delete someone else's lock", async () => {
    // Acquire with 1s TTL
    const lock1 = createLeaderLock("test:lock", 1);
    const acquired1 = await lock1.tryAcquire(redis);
    expect(acquired1).toBe(true);

    // Simulate TTL expiry (real time — 1.2s to be safe)
    await new Promise((r) => setTimeout(r, 1200));

    // A different worker acquires
    const lock2 = createLeaderLock("test:lock", 10);
    const acquired2 = await lock2.tryAcquire(redis);
    expect(acquired2).toBe(true);

    // The original holder tries to release — should NOT delete the new lock
    expect(await lock1.release(redis)).toBe(false);
    // Verify the new lock is still held (tryAcquire from a third party fails)
    const lock3 = createLeaderLock("test:lock", 10);
    expect(await lock3.tryAcquire(redis)).toBe(false);
  });

  it("supports multiple distinct lock keys", async () => {
    const lockA = createLeaderLock("lock:A", 10);
    const lockB = createLeaderLock("lock:B", 10);
    expect(await lockA.tryAcquire(redis)).toBe(true);
    expect(await lockB.tryAcquire(redis)).toBe(true);
  });
});
