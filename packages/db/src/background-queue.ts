import { createHash, randomUUID } from "node:crypto";
import { Prisma, type BackgroundJob } from "@prisma/client";
import { retryPolicyFor, type QueueJob, type QueueJobOptions } from "@actorconsole/shared";
import { db } from "./client";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Store = Prisma.TransactionClient;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const errorCode = (error: unknown) => (error as { code?: string })?.code;

/** InnoDB can roll back a contender during a concurrent claim/upsert. */
export async function withDatabaseRetry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      const rawCode = (error as { meta?: { code?: string } })?.meta?.code;
      const deadlock =
        errorCode(error) === "P2034" ||
        (errorCode(error) === "P2010" && (rawCode === "1213" || rawCode === "1205"));
      if (!deadlock || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}

export class DatabaseJobLeaseLostError extends Error {
  constructor() {
    super("Background job lease was lost");
  }
}

async function addJob(
  store: Store,
  queue: string,
  name: string,
  data: object,
  options: QueueJobOptions,
) {
  const jobId = options.jobId ?? randomUUID();
  if (jobId.length > 191) throw new Error("Job ID must be at most 191 characters");
  const deduplicationKey = options.deduplication ? hash(options.deduplication.id) : null;
  // A completed job can release its deduplication key between the failed create
  // and lookup. Retry that race, but never acknowledge a job that wasn't stored.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await store.backgroundJob.create({
        data: {
          queue,
          jobId,
          name,
          data: json(data),
          options: json(options),
          deduplicationKey,
          availableAt: new Date(Date.now() + Math.max(0, options.delay ?? 0)),
          state: options.delay ? "delayed" : "waiting",
          sortOrder: BigInt(Date.now()) * (options.lifo ? -1n : 1n),
          progress: 0,
        },
      });
    } catch (error) {
      if (errorCode(error) !== "P2002") throw error;
      const existing = await store.backgroundJob.findFirst({
        where: {
          queue,
          OR: [{ jobId }, ...(deduplicationKey ? [{ deduplicationKey }] : [])],
        },
      });
      if (existing) return existing;
    }
  }
  throw new Error("Could not store background job after concurrent deduplication changes");
}

function asJob(row: BackgroundJob, token?: string): QueueJob {
  const job: QueueJob = {
    id: row.jobId,
    name: row.name,
    data: row.data,
    opts: row.options as QueueJobOptions,
    attemptsMade: row.attemptsMade,
    progress: row.progress as number | object,
    returnvalue: row.result,
    failedReason: row.failedReason ?? "",
    async getState() {
      return (
        (await db.backgroundJob.findUnique({ where: { id: row.id }, select: { state: true } }))
          ?.state ?? "unknown"
      );
    },
    async updateProgress(progress) {
      if (!token) throw new DatabaseJobLeaseLostError();
      const result = await db.backgroundJob.updateMany({
        where: {
          id: row.id,
          state: "active",
          leaseToken: token,
          leaseExpiresAt: { gt: new Date() },
        },
        data: { progress: json(progress) },
      });
      if (!result.count) throw new DatabaseJobLeaseLostError();
      job.progress = progress;
    },
  };
  return job;
}

export interface ClaimedDatabaseJob {
  job: QueueJob;
  renew(): Promise<void>;
  complete(result: unknown): Promise<void>;
  fail(error: Error, unrecoverable: boolean): Promise<void>;
}

/** Persistent queue with atomic claims and renewable leases across processes. */
export class DatabaseQueue {
  constructor(public readonly name: string) {}

  async add(name: string, data: object, opts: QueueJobOptions = {}): Promise<QueueJob> {
    const options = { ...retryPolicyFor(this.name), ...opts };
    return asJob(await withDatabaseRetry(() => addJob(db, this.name, name, data, options)));
  }

  async addBulk(
    jobs: { name: string; data: object; opts?: QueueJobOptions }[],
  ): Promise<QueueJob[]> {
    const added: QueueJob[] = [];
    for (const job of jobs) added.push(await this.add(job.name, job.data, job.opts));
    return added;
  }

  async getJob(jobId: string): Promise<QueueJob | undefined> {
    const row = await db.backgroundJob.findUnique({
      where: { queue_jobId: { queue: this.name, jobId } },
    });
    return row ? asJob(row) : undefined;
  }

  async waitUntilReady() {
    await db.$queryRaw`SELECT 1`;
  }
  async close() {
    /* The shared Prisma pool belongs to the application. */
  }

  async claim(leaseMs = 60_000): Promise<ClaimedDatabaseJob | null> {
    // Optimistic compare-and-swap avoids requiring SKIP LOCKED / MySQL 8.
    for (let contender = 0; contender < 20; contender++) {
      const now = new Date();
      const row = await db.backgroundJob.findFirst({
        where: {
          queue: this.name,
          OR: [
            { state: { in: ["waiting", "delayed"] }, availableAt: { lte: now } },
            { state: "active", leaseExpiresAt: { lte: now } },
          ],
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });
      if (!row) return null;
      const options = row.options as QueueJobOptions;
      const token = randomUUID();
      const owner = {
        id: row.id,
        state: row.state,
        leaseToken: row.leaseToken,
        attemptsMade: row.attemptsMade,
        ...(row.state === "active" ? { leaseExpiresAt: { lte: now } } : {}),
      };
      if (row.attemptsMade >= Math.max(1, options.attempts ?? 1)) {
        const failed = await db.backgroundJob.updateMany({
          where: owner,
          data: {
            state: "failed",
            failedReason: "Worker stopped before acknowledging its final attempt",
            deduplicationKey: null,
            leaseToken: null,
            leaseExpiresAt: null,
            finishedAt: now,
          },
        });
        if (failed.count) await this.cleanup("failed", options.removeOnFail, row.id);
        continue;
      }
      const claimed = await withDatabaseRetry(() =>
        db.backgroundJob.updateMany({
          where: owner,
          data: {
            state: "active",
            leaseToken: token,
            leaseExpiresAt: new Date(Date.now() + leaseMs),
            attemptsMade: { increment: 1 },
          },
        }),
      );
      if (!claimed.count) continue;
      const job = asJob(row, token);
      const held = () => ({
        id: row.id,
        state: "active",
        leaseToken: token,
        leaseExpiresAt: { gt: new Date() },
      });
      const update = async (data: Prisma.BackgroundJobUpdateManyMutationInput) => {
        const result = await db.backgroundJob.updateMany({ where: held(), data });
        if (!result.count) throw new DatabaseJobLeaseLostError();
      };
      return {
        job,
        renew: () => update({ leaseExpiresAt: new Date(Date.now() + leaseMs) }),
        complete: async (result) => {
          await update({
            state: "completed",
            result: result == null ? Prisma.JsonNull : json(result),
            deduplicationKey: null,
            leaseToken: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
          });
          job.returnvalue = result ?? null;
          await this.cleanup("completed", options.removeOnComplete, row.id);
        },
        fail: async (error, unrecoverable) => {
          const attempts = row.attemptsMade + 1;
          const terminal = unrecoverable || attempts >= Math.max(1, options.attempts ?? 1);
          const backoff = options.backoff;
          const delay =
            typeof backoff === "number"
              ? backoff
              : (backoff?.delay ?? 0) * (backoff?.type === "exponential" ? 2 ** (attempts - 1) : 1);
          await update({
            state: terminal ? "failed" : "delayed",
            failedReason: error.message.slice(0, 8000),
            ...(terminal ? { deduplicationKey: null, finishedAt: new Date() } : {}),
            availableAt: new Date(Date.now() + delay),
            leaseToken: null,
            leaseExpiresAt: null,
          });
          job.attemptsMade = attempts;
          job.failedReason = error.message;
          if (terminal) await this.cleanup("failed", options.removeOnFail, row.id);
        },
      };
    }
    return null;
  }

  private async cleanup(state: string, keep: QueueJobOptions["removeOnComplete"], id: string) {
    const where = { queue: this.name, state };
    if (keep === true) {
      await db.backgroundJob.deleteMany({ where: { ...where, id } });
    } else if (keep !== false && keep !== undefined) {
      const age = typeof keep === "object" ? keep.age : undefined;
      const count = typeof keep === "number" ? keep : keep.count;
      if (age !== undefined)
        await db.backgroundJob.deleteMany({
          where: { ...where, finishedAt: { lt: new Date(Date.now() - age * 1000) } },
        });
      if (count !== undefined) {
        const old = await db.backgroundJob.findMany({
          where,
          orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
          skip: Math.max(0, count),
          take: 1000,
          select: { id: true },
        });
        if (old.length)
          await db.backgroundJob.deleteMany({
            where: { ...where, id: { in: old.map((job) => job.id) } },
          });
      }
    }
  }
}

export async function acquireDatabaseLease(key: string, token: string, ttlSeconds: number) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const result = await db.backgroundLease.updateMany({
    where: { key, expiresAt: { lte: now } },
    data: { token, expiresAt },
  });
  if (result.count) return true;
  try {
    await db.backgroundLease.create({ data: { key, token, expiresAt } });
    return true;
  } catch (error) {
    if (errorCode(error) === "P2002") return false;
    throw error;
  }
}

export async function renewDatabaseLease(key: string, token: string, ttlSeconds: number) {
  const result = await db.backgroundLease.updateMany({
    where: { key, token, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date(Date.now() + ttlSeconds * 1000) },
  });
  return result.count === 1;
}

export async function releaseDatabaseLease(key: string, token: string) {
  return (await db.backgroundLease.deleteMany({ where: { key, token } })).count === 1;
}

export async function upsertDatabaseSchedule(
  queue: string,
  schedulerId: string,
  schedule: { pattern: string; tz?: string },
  template: { name: string; data: object; opts?: QueueJobOptions },
) {
  const id = hash(`${queue}:${schedulerId}`);
  const data = {
    queue,
    name: template.name,
    pattern: schedule.pattern,
    timezone: schedule.tz ?? "UTC",
    data: json(template.data),
    options: json({ ...retryPolicyFor(queue), ...template.opts }),
  };
  await withDatabaseRetry(() =>
    db.backgroundSchedule.upsert({
      where: { id },
      create: { id, ...data, nextRunAt: new Date() },
      update: data,
    }),
  );
}

export async function removeDatabaseSchedule(queue: string, schedulerId: string) {
  await db.backgroundSchedule.deleteMany({ where: { id: hash(`${queue}:${schedulerId}`) } });
}

export async function tickDatabaseSchedules(
  nextRun: (pattern: string, timezone: string, after: Date) => Date,
) {
  const now = new Date();
  const due = await db.backgroundSchedule.findMany({
    where: { nextRunAt: { lte: now } },
    take: 100,
  });
  for (const schedule of due) {
    await withDatabaseRetry(() =>
      db.$transaction(async (tx) => {
        const claimed = await tx.backgroundSchedule.updateMany({
          where: { id: schedule.id, nextRunAt: schedule.nextRunAt },
          data: { nextRunAt: nextRun(schedule.pattern, schedule.timezone, now) },
        });
        if (!claimed.count) return;
        await addJob(tx, schedule.queue, schedule.name, schedule.data as object, {
          ...(schedule.options as QueueJobOptions),
          jobId: `repeat-${schedule.id}-${schedule.nextRunAt.getTime()}`,
        });
      }),
    );
  }
}

/** Shared sliding window, serialized by an InnoDB row lock (also on MariaDB). */
export async function checkDatabaseRateLimit(key: string, opts: { windowMs: number; max: number }) {
  const bucketKey = hash(key);
  return withDatabaseRetry(() =>
    db.$transaction(async (tx) => {
      // ON DUPLICATE KEY obtains an exclusive lock directly. INSERT IGNORE takes
      // shared duplicate-key locks that can deadlock when all readers upgrade.
      await tx.$executeRaw`INSERT INTO RateLimitBucket (\`key\`, timestamps, expiresAt)
      VALUES (${bucketKey}, '[]', ${new Date(Date.now() + opts.windowMs)})
      ON DUPLICATE KEY UPDATE \`key\` = VALUES(\`key\`)`;
      const rows = await tx.$queryRaw<{ timestamps: Prisma.JsonValue }[]>`
      SELECT timestamps FROM RateLimitBucket WHERE \`key\` = ${bucketKey} FOR UPDATE`;
      const now = Date.now();
      // Raw JSON columns are returned as parsed JSON by Prisma's MySQL connector.
      const value = rows[0]?.timestamps;
      const timestamps = (typeof value === "string" ? JSON.parse(value) : value) as number[];
      const fresh = timestamps.filter((stamp) => stamp > now - opts.windowMs);
      const allowed = fresh.length < opts.max;
      if (allowed) fresh.push(now);
      await tx.rateLimitBucket.update({
        where: { key: bucketKey },
        data: {
          timestamps: fresh,
          expiresAt: new Date(now + opts.windowMs),
        },
      });
      return {
        allowed,
        remaining: Math.max(0, opts.max - fresh.length),
        retryAfterMs: allowed ? 0 : Math.max(1, (fresh[0] ?? now) + opts.windowMs - now),
      };
    }),
  );
}

export async function pruneBackgroundInfrastructure() {
  await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.backgroundLease.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
