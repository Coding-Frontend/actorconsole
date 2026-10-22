import type IORedis from "ioredis";

/**
 * Distributed lock primitive using Redis `SET key value NX EX ttl`.
 *
 * Use for periodic leader-elected tasks (e.g. cron tick, daily snapshot).
 * Only one worker replica acquires the lock per TTL window; the others
 * no-op. If the holder crashes, the lock auto-expires after the TTL.
 *
 * Each acquire mints a unique token. The token is stashed on the LOCK
 * INSTANCE (not the redis client) so a different LeaderLock instance
 * can never accidentally release a lock it doesn't own.
 */
export interface LeaderLock {
  /** Acquire the lock. Returns true if this caller holds it. */
  tryAcquire(redis: IORedis): Promise<boolean>;
  /** Release the lock IFF this caller still holds it. */
  release(redis: IORedis): Promise<boolean>;
}

export function createLeaderLock(key: string, ttlSeconds: number): LeaderLock {
  let currentToken: string | null = null;

  return {
    async tryAcquire(redis: IORedis): Promise<boolean> {
      const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await redis.set(key, token, "EX", ttlSeconds, "NX");
      if (result === "OK") {
        currentToken = token;
        return true;
      }
      currentToken = null;
      return false;
    },

    async release(redis: IORedis): Promise<boolean> {
      if (!currentToken) return false;
      // Lua: only delete if the value still matches our token.
      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
      const result = (await redis.eval(script, 1, key, currentToken)) as number;
      currentToken = null;
      return result === 1;
    },
  };
}

export const SCHEDULE_TICK_LOCK_KEY = "actorconsole:worker:schedule-tick:lock";
export const SCHEDULE_TICK_LOCK_TTL_SECONDS = 25; // < 30s tick interval

export const scheduleTickLock = createLeaderLock(
  SCHEDULE_TICK_LOCK_KEY,
  SCHEDULE_TICK_LOCK_TTL_SECONDS,
);
