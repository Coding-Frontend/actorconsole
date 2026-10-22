import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

const QUEUE_COMMAND_TIMEOUT_MS = 1_500;

function withTimeout<T>(promise: Promise<T>, timeoutMs = QUEUE_COMMAND_TIMEOUT_MS): Promise<T> {
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

declare global {
  var __redis: IORedis | undefined;

  var __queues: Map<string, Queue> | undefined;
}

/**
 * Lazy Redis connection. Returns null in environments where Redis isn't
 * configured (e.g. local dev without docker compose running).
 */
export function getRedis(): IORedis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!global.__redis) {
    global.__redis = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: QUEUE_COMMAND_TIMEOUT_MS,
    });
  }
  return global.__redis;
}

function getQueueMap(): Map<string, Queue> {
  if (!global.__queues) global.__queues = new Map();
  return global.__queues;
}

export type QueueName =
  "schedules" | "snapshots" | "audience" | "catalog" | "newsletter" | "optimization";

export interface JobPayloadMap {
  schedules:
    | { bulkPublishScheduleId: string; force?: boolean }
    | {
        bulkActorStatus: {
          operationId: string;
          userId: string;
          businessProfileId: string;
        };
      };
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

export async function getQueuedJob(name: QueueName, jobId: string) {
  const redis = getRedis();
  if (!redis) return null;
  let queue = getQueueMap().get(name);
  if (!queue) {
    queue = new Queue(name, { connection: redis });
    getQueueMap().set(name, queue);
  }
  return withTimeout(queue.getJob(jobId));
}

/**
 * Enqueue a job. Returns null if Redis isn't configured (dev mode).
 *
 * Picks up retry/backoff defaults from `@actorconsole/shared/queue/retry-policies`
 * so jobs enqueued from the API inherit the same retry semantics as jobs
 * enqueued by the worker. Caller-supplied `opts` are merged on top, with
 * the caller winning on conflict.
 */
export async function enqueue<K extends QueueName>(
  name: K,
  payload: JobPayloadMap[K],
  opts: JobsOptions = {},
): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  let queue = getQueueMap().get(name);
  if (!queue) {
    queue = new Queue(name, { connection: redis });
    getQueueMap().set(name, queue);
  }
  const { retryPolicyFor } = await import("@actorconsole/shared");
  const defaults = retryPolicyFor(name) ?? {};
  const merged: JobsOptions = { ...defaults, ...opts };
  const job = await withTimeout(queue.add(name, payload as unknown as object, merged));
  return job.id ?? null;
}
