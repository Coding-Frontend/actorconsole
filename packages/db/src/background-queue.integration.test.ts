import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.QUEUE_TEST_DATABASE_URL;
let queueModule: typeof import("./background-queue");
let db: typeof import("./client").db;
describe.skipIf(!url)("database queue integration (dedicated migrated database)", () => {
  beforeAll(async () => {
    if (new URL(url!).pathname !== "/actorconsole_optionalredis_test") {
      throw new Error("Use a disposable database named actorconsole_optionalredis_test");
    }
    process.env.DATABASE_URL = url;
    queueModule = await import("./background-queue");
    db = (await import("./client")).db;
  });
  beforeEach(async () => {
    await db.backgroundJob.deleteMany();
    await db.backgroundSchedule.deleteMany();
    await db.backgroundLease.deleteMany();
    await db.rateLimitBucket.deleteMany();
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("persists jobs, progress and results across producer/consumer instances", async () => {
    const queue = new queueModule.DatabaseQueue("snapshots");
    const first = await queue.add("refresh", {
      workspaceBootstrap: { userId: "u", businessProfileId: "b" },
    });
    const reopened = new queueModule.DatabaseQueue("snapshots");
    const claim = (await reopened.claim())!;
    expect(claim.job.id).toBe(first.id);
    expect(claim.job.attemptsMade).toBe(0);
    await claim.job.updateProgress({ completed: 1 });
    expect((await queue.getJob(first.id!))?.progress).toEqual({ completed: 1 });
    await claim.complete({ imported: 7 });
    const saved = (await queue.getJob(first.id!))!;
    expect(await saved.getState()).toBe("completed");
    expect(saved.returnvalue).toEqual({ imported: 7 });
  });

  it("acknowledges duplicates with the original job and releases simple deduplication on completion", async () => {
    const queue = new queueModule.DatabaseQueue("snapshots");
    const ids = await Promise.all(
      Array.from({ length: 8 }, () =>
        queue.add("refresh", {}, { deduplication: { id: "workspace-1" } }),
      ),
    );
    expect(new Set(ids.map((job) => job.id)).size).toBe(1);
    expect(await db.backgroundJob.count()).toBe(1);
    await (await queue.claim())!.complete(null);
    expect((await queue.add("refresh", {}, { deduplication: { id: "workspace-1" } })).id).not.toBe(
      ids[0].id,
    );
    const named = await queue.add("same", {}, { jobId: "manual-1" });
    expect((await queue.add("same", {}, { jobId: "manual-1" })).id).toBe(named.id);
  });

  it("allows only one consumer to claim each job under contention", async () => {
    const queue = new queueModule.DatabaseQueue("audience");
    await queue.add("audience", {});
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => new queueModule.DatabaseQueue("audience").claim()),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    await claims.find(Boolean)!.complete(null);
  });

  it("prioritizes LIFO refresh work and leaves delayed jobs for a later invocation", async () => {
    const queue = new queueModule.DatabaseQueue("snapshots");
    await queue.add("older", {}, { jobId: "older" });
    await queue.add("delayed", {}, { delay: 60_000 });
    await queue.add("refresh", {}, { jobId: "refresh", lifo: true });
    const first = (await queue.claim())!;
    expect(first.job.id).toBe("refresh");
    await first.complete(null);
    await (await queue.claim())!.complete(null);
    expect(await queue.claim()).toBeNull();
  });

  it("persists retry delay, respects the attempt budget and marks permanent errors failed", async () => {
    const queue = new queueModule.DatabaseQueue("optimization");
    const job = await queue.add(
      "audit",
      {},
      { attempts: 2, backoff: { type: "exponential", delay: 1000 } },
    );
    const claim = (await queue.claim())!;
    await claim.fail(new Error("temporary"), false);
    expect(await (await queue.getJob(job.id!))!.getState()).toBe("delayed");
    expect(await queue.claim()).toBeNull();
    await db.backgroundJob.updateMany({
      where: { jobId: job.id! },
      data: { availableAt: new Date(0) },
    });
    const retry = (await queue.claim())!;
    expect(retry.job.attemptsMade).toBe(1);
    await retry.fail(new Error("still failing"), false);
    expect(await (await queue.getJob(job.id!))!.getState()).toBe("failed");
    const permanent = await queue.add("apply", {}, { attempts: 5 });
    await (await queue.claim())!.fail(new Error("permanent"), true);
    expect(await (await queue.getJob(permanent.id!))!.getState()).toBe("failed");
  });

  it("recovers an expired claim and fences stale progress, completion, failure and renewal", async () => {
    const queue = new queueModule.DatabaseQueue("schedules");
    const job = await queue.add("publish", {}, { attempts: 3 });
    const old = (await queue.claim())!;
    await db.backgroundJob.updateMany({
      where: { jobId: job.id! },
      data: { leaseExpiresAt: new Date(0) },
    });
    const recovered = (await queue.claim())!;
    expect(recovered.job.id).toBe(job.id);
    expect(recovered.job.attemptsMade).toBe(1);
    for (const work of [
      () => old.job.updateProgress(50),
      () => old.complete(null),
      () => old.fail(new Error("late"), false),
      () => old.renew(),
    ]) {
      await expect(work()).rejects.toThrow("lease was lost");
    }
    await recovered.renew();
    await recovered.complete("published");
    expect((await queue.getJob(job.id!))?.returnvalue).toBe("published");
  });

  it("does not re-execute a crashed job after its last attempt", async () => {
    const queue = new queueModule.DatabaseQueue("snapshots");
    const job = await queue.add("once", {}, { attempts: 1 });
    await queue.claim();
    await db.backgroundJob.updateMany({
      where: { jobId: job.id! },
      data: { leaseExpiresAt: new Date(0) },
    });
    expect(await queue.claim()).toBeNull();
    expect(await (await queue.getJob(job.id!))!.getState()).toBe("failed");
  });

  it("keeps the configured history and removes only the current job for removeOnComplete=true", async () => {
    const queue = new queueModule.DatabaseQueue("newsletter");
    const kept = await queue.add("keep", {});
    await (await queue.claim())!.complete(null);
    const removed = await queue.add("remove", {}, { removeOnComplete: true });
    await (await queue.claim())!.complete(null);
    expect(await queue.getJob(kept.id!)).toBeDefined();
    expect(await queue.getJob(removed.id!)).toBeUndefined();
    await queue.add("limited", {}, { removeOnComplete: { count: 1 } });
    await (await queue.claim())!.complete(null);
    expect(await db.backgroundJob.count({ where: { state: "completed" } })).toBe(1);
  });

  it("protects shared publishing leases from other holders and expired owners", async () => {
    const { acquireDatabaseLease, renewDatabaseLease, releaseDatabaseLease } = queueModule;
    const results = await Promise.all([
      acquireDatabaseLease("schedule-1", "owner-1", 60),
      acquireDatabaseLease("schedule-1", "owner-2", 60),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const owner = results[0] ? "owner-1" : "owner-2";
    expect(await releaseDatabaseLease("schedule-1", "stranger")).toBe(false);
    expect(await renewDatabaseLease("schedule-1", owner, 60)).toBe(true);
    await db.backgroundLease.update({
      where: { key: "schedule-1" },
      data: { expiresAt: new Date(0) },
    });
    expect(await renewDatabaseLease("schedule-1", owner, 60)).toBe(false);
    expect(await acquireDatabaseLease("schedule-1", "new-owner", 60)).toBe(true);
    expect(await releaseDatabaseLease("schedule-1", owner)).toBe(false);
  });

  it("atomically enqueues each recurring occurrence once across concurrent scheduler ticks", async () => {
    await queueModule.upsertDatabaseSchedule(
      "catalog",
      "hourly",
      { pattern: "15 * * * *" },
      { name: "details", data: { catalog: "details" } },
    );
    const next = () => new Date(Date.now() + 3_600_000);
    await Promise.all(Array.from({ length: 5 }, () => queueModule.tickDatabaseSchedules(next)));
    expect(await db.backgroundJob.count()).toBe(1);
    await queueModule.upsertDatabaseSchedule(
      "catalog",
      "hourly",
      { pattern: "15 * * * *" },
      { name: "details", data: { catalog: "details" } },
    );
    await queueModule.tickDatabaseSchedules(next);
    expect(await db.backgroundJob.count()).toBe(1);
  });

  it("enforces a shared sliding rate limit across concurrent requests", async () => {
    const options = { windowMs: 60_000, max: 5 };
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        queueModule.checkDatabaseRateLimit("fixture-client", options),
      ),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(
      results.filter((result) => !result.allowed).every((result) => result.retryAfterMs > 0),
    ).toBe(true);
    await db.rateLimitBucket.updateMany({ data: { timestamps: [Date.now() - 60_001] } });
    expect((await queueModule.checkDatabaseRateLimit("fixture-client", options)).allowed).toBe(
      true,
    );
  });
});
