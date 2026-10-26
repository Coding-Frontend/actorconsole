import type IORedis from "ioredis";
import { UnrecoverableError } from "bullmq";
import { getLogger } from "@actorconsole/shared";
import { createLeaderLock } from "./leader-election.js";

const log = getLogger("worker:publishing-lease");
export const PUBLISHING_LEASE_TTL_SECONDS = 60 * 60;
export const PUBLISHING_LEASE_RENEW_MS = (PUBLISHING_LEASE_TTL_SECONDS * 1000) / 3;
const REDIS_COMMAND_TIMEOUT_MS = 5_000;

export interface PublishingLease {
  assertHeld(): Promise<void>;
}

/** Ownership loss has an uncertain in-flight outcome: require review instead of
 * allowing automatic retries to blindly repeat an external publishing action. */
export class PublishingLeaseLostError extends UnrecoverableError {
  constructor() {
    super(
      "Publishing lease ownership was lost; stop this run and reconcile its last action before retrying",
    );
  }
}

function boundedRedisCommand<T>(command: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Publishing lease command timed out")),
      REDIS_COMMAND_TIMEOUT_MS,
    );
    command.then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function withPublishingLease<T>(
  redis: IORedis,
  scheduleId: string,
  work: (lease: PublishingLease) => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const lock = createLeaderLock(
    `actorconsole:worker:bulk-publish:${scheduleId}:lock`,
    PUBLISHING_LEASE_TTL_SECONDS,
  );
  // Start the local monotonic deadline before the Redis request, conservatively.
  let validUntil = performance.now() + PUBLISHING_LEASE_TTL_SECONDS * 1000;
  if (!(await lock.tryAcquire(redis))) return { acquired: false };
  let lost: PublishingLeaseLostError | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let renewal: Promise<void> | undefined;
  const lose = () => {
    lost ??= new PublishingLeaseLostError();
    clearTimeout(timer);
    return lost;
  };
  const check = () => {
    if (lost) throw lost;
    if (stopped || performance.now() >= validUntil) throw lose();
  };
  const renew = async () => {
    check();
    if (renewal) return renewal;
    const requestedAt = performance.now();
    const pending = (async () => {
      try {
        const owned = await boundedRedisCommand(lock.renew(redis));
        check();
        if (!owned) throw lose();
        // A late response must not resurrect a locally expired/lost lease.
        validUntil = requestedAt + PUBLISHING_LEASE_TTL_SECONDS * 1000;
      } catch {
        throw lose();
      }
    })();
    renewal = pending;
    try {
      await pending;
    } finally {
      if (renewal === pending) renewal = undefined;
    }
  };
  const scheduleRenewal = () => {
    timer = setTimeout(async () => {
      try {
        await renew();
      } catch {
        /* Remains lost until the work reaches its next guard. */
      }
      if (!stopped && !lost) scheduleRenewal();
    }, PUBLISHING_LEASE_RENEW_MS);
  };
  const lease: PublishingLease = { assertHeld: renew };
  try {
    await lease.assertHeld();
    scheduleRenewal();
    const value = await work(lease);
    await lease.assertHeld();
    return { acquired: true, value };
  } finally {
    stopped = true;
    clearTimeout(timer);
    if (renewal) await renewal.catch(() => undefined);
    await boundedRedisCommand(lock.release(redis)).catch(() => {
      log.warn(
        { scheduleId },
        "Could not release publishing lease; its Redis TTL remains the fallback",
      );
    });
  }
}
