import { Queue } from "bullmq";
import IORedis from "ioredis";
import { isRedisEnabled, type PublishingJobPayload, type QueueJobOptions } from "@actorconsole/shared";
import { DatabaseQueue } from "@actorconsole/db";

const QUEUE_COMMAND_TIMEOUT_MS = 1_500;

function withTimeout<T>(promise: Promise<T>, timeoutMs = QUEUE_COMMAND_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Queue command timed out")), timeoutMs);
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

declare global {
  var __redis: IORedis | undefined;

  var __queues: Map<string, Queue | DatabaseQueue> | undefined;
}

/**
 * A disabled Redis connection is never constructed, even if REDIS_URL remains
 * set. Queue producers use the database backend in that mode.
 */
export function getRedis(): IORedis | null {
  if (!isRedisEnabled()) return null;
  const url = process.env.REDIS_URL!;
  if (!global.__redis) {
    global.__redis = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: QUEUE_COMMAND_TIMEOUT_MS,
    });
  }
  return global.__redis;
}

function getQueueMap(): Map<string, Queue | DatabaseQueue> {
  if (!global.__queues) global.__queues = new Map();
  return global.__queues;
}

export type QueueName =
  "schedules" | "snapshots" | "audience" | "catalog" | "newsletter" | "optimization";

export interface JobPayloadMap {
  schedules: PublishingJobPayload;
  snapshots: {
    actorId?: string;
    catalog?: "search" | "details" | "websites" | "logos";
    bootstrapInsights?: boolean;
    workspaceBootstrap?: { userId: string; businessProfileId: string };
    workspaceInventory?: { userId: string; businessProfileId: string };
  };
  audience: { userId: string; businessProfileId: string };
  catalog: {
    catalog: "search" | "details" | "websites" | "logos";
  };
  newsletter: { campaignId: string };
  optimization: {
    action: "audit" | "apply";
    resultId: string;
  };
}

function getQueue(name: QueueName) {
  let queue = getQueueMap().get(name);
  if (!queue) {
    const redis = getRedis();
    queue = redis ? new Queue(name, { connection: redis }) : new DatabaseQueue(name);
    getQueueMap().set(name, queue);
  }
  return queue;
}

export async function getQueuedJob(name: QueueName, jobId: string) {
  const queue = getQueue(name);
  return withTimeout(queue.getJob(jobId));
}

/**
 * Enqueue a durable job in Redis or MySQL according to REDIS_ENABLED.
 *
 * Picks up retry/backoff defaults from `@actorconsole/shared/queue/retry-policies`
 * so jobs enqueued from the API inherit the same retry semantics as jobs
 * enqueued by the worker. Caller-supplied `opts` are merged on top, with
 * the caller winning on conflict.
 */
export async function enqueue<K extends QueueName>(
  name: K,
  payload: JobPayloadMap[K],
  opts: QueueJobOptions = {},
): Promise<string | null> {
  const queue = getQueue(name);
  const { retryPolicyFor } = await import("@actorconsole/shared");
  const defaults = retryPolicyFor(name) ?? {};
  const merged: QueueJobOptions = { ...defaults, ...opts };
  const job = await withTimeout(queue.add(name, payload as unknown as object, merged));
  return job.id ?? null;
}
