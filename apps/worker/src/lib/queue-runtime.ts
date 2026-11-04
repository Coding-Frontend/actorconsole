import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { CronExpressionParser } from "cron-parser";
import {
  DatabaseQueue,
  upsertDatabaseSchedule,
  removeDatabaseSchedule,
  tickDatabaseSchedules,
} from "@actorconsole/db";
import {
  isRedisEnabled,
  retryPolicyFor,
  getLogger,
  type QueueJob,
  type QueueJobOptions,
} from "@actorconsole/shared";
import { DatabaseWorker } from "./database-worker.js";

let redis: IORedis | undefined;
export function getRedis(): IORedis | null {
  if (!isRedisEnabled()) return null;
  return (redis ??= new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }));
}

export interface RuntimeQueue {
  name: string;
  add(name: string, data: object, options?: QueueJobOptions): Promise<QueueJob>;
  addBulk(jobs: { name: string; data: object; opts?: QueueJobOptions }[]): Promise<QueueJob[]>;
  waitUntilReady(): Promise<unknown>;
  close(): Promise<void>;
  upsertJobScheduler(
    id: string,
    repeat: { pattern: string; tz?: string },
    template: { name: string; data: object },
  ): Promise<unknown>;
  removeJobScheduler(id: string): Promise<unknown>;
}

class ScheduledDatabaseQueue extends DatabaseQueue implements RuntimeQueue {
  upsertJobScheduler(
    id: string,
    repeat: { pattern: string; tz?: string },
    template: { name: string; data: object },
  ) {
    // Validate before persisting so a bad schedule cannot block every tick.
    CronExpressionParser.parse(repeat.pattern, { tz: repeat.tz ?? "UTC" });
    return upsertDatabaseSchedule(this.name, id, repeat, template);
  }
  removeJobScheduler(id: string) {
    return removeDatabaseSchedule(this.name, id);
  }
}

export function createQueue(name: string): RuntimeQueue {
  const connection = getRedis();
  return connection
    ? new Queue(name, { connection, defaultJobOptions: retryPolicyFor(name) })
    : new ScheduledDatabaseQueue(name);
}

export interface RuntimeWorker {
  name: string;
  close(): Promise<void>;
  on(event: "failed", listener: (job: QueueJob | undefined, error: Error) => void): this;
  on(event: "completed", listener: (job: QueueJob) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
}

export function createWorker<T = any>(
  name: string,
  processor: (job: QueueJob<T>) => Promise<unknown>,
  options: { concurrency: number; autorun: boolean },
): RuntimeWorker {
  const connection = getRedis();
  const worker: RuntimeWorker = connection
    ? new Worker<T>(name, processor, { connection, ...options })
    : new DatabaseWorker<T>(name, processor, options.concurrency);
  worker.on("error", (error) =>
    getLogger("worker:queue").error({ error, queue: name }, "Queue worker error"),
  );
  if (worker instanceof DatabaseWorker && options.autorun) void worker.run();
  return worker;
}

export async function tickRecurringJobs() {
  if (isRedisEnabled()) return;
  await tickDatabaseSchedules((pattern, timezone, after) =>
    CronExpressionParser.parse(pattern, { tz: timezone, currentDate: after }).next().toDate(),
  );
}
