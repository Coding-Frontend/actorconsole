import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Queue } from "bullmq";
import {
  createQueue,
  createWorker,
  getRedis,
  type RuntimeQueue,
  type RuntimeWorker,
} from "../../src/lib/queue-runtime.js";

const redisUrl = process.env.QUEUE_TEST_REDIS_URL;
describe.skipIf(!redisUrl)("Redis queue runtime integration (isolated test queue)", () => {
  let queue: RuntimeQueue;
  let worker: RuntimeWorker;
  const name = `optional-redis-test-${randomUUID()}`;
  beforeAll(() => {
    vi.stubEnv("REDIS_ENABLED", "true");
    vi.stubEnv("REDIS_URL", redisUrl!);
    queue = createQueue(name);
  });
  afterAll(async () => {
    await worker?.close();
    await queue?.close();
    const cleanup = new Queue(name, { connection: getRedis()! });
    await cleanup.obliterate({ force: true });
    await cleanup.close();
    await getRedis()?.quit();
    vi.unstubAllEnvs();
  });
  it("executes the shared processor in BullMQ with progress, retries and the configured Redis database", async () => {
    const attempts: number[] = [];
    const completed = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Redis worker test timed out")), 10_000);
      worker = createWorker(
        name,
        async (job) => {
          attempts.push(job.attemptsMade);
          if (job.attemptsMade === 0) throw new Error("transient fixture failure");
          await job.updateProgress({ complete: 1 });
          return { done: true };
        },
        { concurrency: 1, autorun: true },
      );
      worker.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      worker.on("completed", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await Promise.all([
      completed,
      queue.add(
        "fixture",
        { value: 1 },
        { jobId: "fixture", attempts: 2, backoff: { type: "fixed", delay: 10 } },
      ),
    ]);
    expect(attempts).toEqual([0, 1]);
    expect(getRedis()!.options.db).toBe(Number(new URL(redisUrl!).pathname.slice(1) || 0));
    const inspector = new Queue(name, { connection: getRedis()! });
    const job = (await inspector.getJob("fixture"))!;
    expect(job.progress).toEqual({ complete: 1 });
    expect(job.returnvalue).toEqual({ done: true });
    await inspector.close();
  }, 15_000);
});
