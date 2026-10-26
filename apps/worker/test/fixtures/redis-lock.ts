import type IORedis from "ioredis";
import { vi } from "vitest";

/** A bounded in-memory Redis fixture sharing the fake wall clock. No sockets. */
export function redisLockFixture() {
  const store = new Map<string, { token: string; expiresAt: number }>();
  const read = (key: string) => {
    const value = store.get(key);
    if (value && value.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return value;
  };
  const set = vi.fn(
    async (key: string, token: string, mode: string, seconds: number, condition: string) => {
      if (mode !== "EX" || condition !== "NX") throw new Error("Unexpected Redis SET arguments");
      if (read(key)) return null;
      store.set(key, { token, expiresAt: Date.now() + seconds * 1000 });
      return "OK";
    },
  );
  const evalCommand = vi.fn(
    async (script: string, keys: number, key: string, token: string, ttl?: number) => {
      if (keys !== 1 || !script.includes('redis.call("GET", KEYS[1]) == ARGV[1]'))
        throw new Error("Expected an atomic ownership check");
      const current = read(key);
      if (!current || current.token !== token) return 0;
      if (ttl !== undefined) {
        if (!script.includes('redis.call("EXPIRE", KEYS[1], ARGV[2])'))
          throw new Error("Expected an ownership-checked expiry extension");
        current.expiresAt = Date.now() + Number(ttl) * 1000;
      } else {
        if (!script.includes('redis.call("DEL", KEYS[1])'))
          throw new Error("Expected an ownership-checked release");
        store.delete(key);
      }
      return 1;
    },
  );
  return { redis: { set, eval: evalCommand } as unknown as IORedis, set, eval: evalCommand, read };
}
