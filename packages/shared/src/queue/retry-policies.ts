/**
 * Per-queue retry and backoff policies. Applied to every job added to
 * the matching queue unless the caller explicitly overrides them.
 *
 * The worker and the API both consume this map so jobs enqueued from
 * the API inherit the same retry semantics as jobs enqueued by the
 * worker's internal tick.
 *
 * We use a structural type here (not `import type { JobsOptions } from
 * "bullmq"`) so this package doesn't need a peer dependency on BullMQ.
 * The shape matches BullMQ's `JobsOptions` but only the fields we set
 * are required.
 *
 * Tuning rationale
 * ----------------
 * - **schedules** (3 attempts, 5s exp): publishing and lifecycle jobs.
 *   Exponential backoff protects Apify from repeated transient requests.
 * - **snapshots** (2 attempts, 30s exp): daily Apify scrape. Source
 *   data is idempotent; better to wait and try again than hammer a
 *   rate-limited endpoint. The 30s base is conservative.
 *
 * `removeOnComplete: { count: N }` keeps Redis from growing without
 * bound while preserving enough history to debug the most recent
 * batch of jobs. `removeOnFail: { count: N }` is the same idea but
 * for failed jobs (we keep more because they're rarer and more
 * useful for postmortem).
 */
export interface RetryPolicy {
  attempts: number;
  backoff: { type: "exponential" | "fixed"; delay: number };
  removeOnComplete: { count: number };
  removeOnFail: { count: number };
}

export const QUEUE_RETRY_POLICIES: Readonly<Record<string, RetryPolicy>> = {
  schedules: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
  snapshots: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 1000 },
  },
  audience: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  },
  catalog: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 1000 },
  },
  newsletter: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 1000 },
  },
  optimization: {
    attempts: 2,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
};

export type QueueNameWithPolicy = keyof typeof QUEUE_RETRY_POLICIES;

/** Returns the retry policy for a queue, or undefined if not registered. */
export function retryPolicyFor(queue: string): RetryPolicy | undefined {
  return Object.prototype.hasOwnProperty.call(QUEUE_RETRY_POLICIES, queue)
    ? QUEUE_RETRY_POLICIES[queue]
    : undefined;
}
