import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Job } from "bullmq";
import { createLeaderLock } from "../../src/lib/leader-election.js";
import {
  withPublishingLease,
  PublishingLeaseLostError,
  PUBLISHING_LEASE_RENEW_MS,
} from "../../src/lib/publishing-lease.js";
import { redisLockFixture } from "../fixtures/redis-lock.js";

const ACTOR_WAIT_MS = 900_000;
const TWO_HOURS = 2 * 60 * 60 * 1000;

describe("publishing lease across worker replicas", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("prevents automatic retry in the installed BullMQ job implementation", async () => {
    const shouldRetry = (Job.prototype as unknown as {
      shouldRetryJob(error: Error): Promise<[boolean, number]>;
    }).shouldRetryJob;
    const retry = await shouldRetry.call(
      { attemptsMade: 0, opts: { attempts: 5 }, discarded: false },
      new PublishingLeaseLostError(),
    );
    expect(retry).toEqual([false, 0]);
  });

  it("keeps a long nine-actor run exclusive beyond both the lease TTL and API run-age guard", async () => {
    const { redis } = redisLockFixture();
    let firstRunning = false;
    let overlap = false;
    const providerWrite = vi.fn();
    const first = withPublishingLease(redis, "schedule-fixture", async (lease) => {
      firstRunning = true;
      for (let actor = 0; actor < 9; actor++) {
        await lease.assertHeld();
        providerWrite("worker-one", actor);
        await new Promise((resolve) => setTimeout(resolve, ACTOR_WAIT_MS));
      }
      firstRunning = false;
    });
    await vi.advanceTimersByTimeAsync(TWO_HOURS + 1);
    const runningWhenSecondArrived = firstRunning;
    const second = await withPublishingLease(redis, "schedule-fixture", async () => {
      overlap = firstRunning;
      providerWrite("worker-two", 0);
    });
    await vi.advanceTimersByTimeAsync(ACTOR_WAIT_MS);
    await first;
    expect(runningWhenSecondArrived).toBe(true);
    expect(second.acquired).toBe(false);
    expect(overlap).toBe(false);
    expect(providerWrite.mock.calls.filter(([worker]) => worker === "worker-two")).toHaveLength(0);
  });
  it("stops an expired worker after a process pause and cannot release the replacement's lease", async () => {
    const fixture = redisLockFixture();
    let continueFirst!: () => void;
    let continueSecond!: () => void;
    const firstWrite = vi.fn();
    const secondWrite = vi.fn();
    const first = withPublishingLease(fixture.redis, "paused", async (lease) => {
      await new Promise<void>((resolve) => {
        continueFirst = resolve;
      });
      await lease.assertHeld();
      firstWrite();
    }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    // A paused process does not run its heartbeat callbacks while Redis time advances.
    vi.setSystemTime(new Date(Date.now() + TWO_HOURS));
    vi.spyOn(performance, "now").mockReturnValue(TWO_HOURS);
    const second = withPublishingLease(fixture.redis, "paused", async (lease) => {
      await new Promise<void>((resolve) => {
        continueSecond = resolve;
      });
      await lease.assertHeld();
      secondWrite();
    });
    await vi.advanceTimersByTimeAsync(0);
    const replacement = fixture.read("actorconsole:worker:bulk-publish:paused:lock")?.token;
    continueFirst();
    expect(await first).toBeInstanceOf(PublishingLeaseLostError);
    expect(firstWrite).not.toHaveBeenCalled();
    expect(fixture.read("actorconsole:worker:bulk-publish:paused:lock")?.token).toBe(replacement);
    expect(
      (await withPublishingLease(fixture.redis, "paused", async () => undefined)).acquired,
    ).toBe(false);
    continueSecond();
    expect((await second).acquired).toBe(true);
    expect(secondWrite).toHaveBeenCalledOnce();
  });

  it("fails closed after a heartbeat error instead of starting the next actor", async () => {
    const fixture = redisLockFixture();
    const write = vi.fn();
    const first = withPublishingLease(fixture.redis, "heartbeat-error", async (lease) => {
      write("already-started");
      await new Promise((resolve) => setTimeout(resolve, PUBLISHING_LEASE_RENEW_MS + 10));
      await lease.assertHeld();
      write("next-actor");
    }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    fixture.eval.mockRejectedValueOnce(new Error("Redis unavailable"));
    await vi.advanceTimersByTimeAsync(PUBLISHING_LEASE_RENEW_MS + 10);
    expect(await first).toBeInstanceOf(PublishingLeaseLostError);
    expect(write.mock.calls).toEqual([["already-started"]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a hanging renewal and does not resurrect ownership on its late reply", async () => {
    const fixture = redisLockFixture();
    let continueWork!: () => void;
    let lateReply!: (value: number) => void;
    const write = vi.fn();
    const work = withPublishingLease(fixture.redis, "hanging", async (lease) => {
      await new Promise<void>((resolve) => {
        continueWork = resolve;
      });
      await lease.assertHeld();
      write();
    }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    fixture.eval.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          lateReply = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(PUBLISHING_LEASE_RENEW_MS + 5_001);
    continueWork();
    expect(await work).toBeInstanceOf(PublishingLeaseLostError);
    lateReply(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(write).not.toHaveBeenCalled();
    expect(
      (await withPublishingLease(fixture.redis, "hanging", async () => "replacement")).acquired,
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves the original task error if best-effort release fails", async () => {
    const fixture = redisLockFixture();
    const failure = new Error("Provider action failed");
    await expect(
      withPublishingLease(fixture.redis, "release-error", async () => {
        fixture.eval.mockRejectedValueOnce(new Error("Release unavailable"));
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows unrelated schedules to run independently and cleans up heartbeat timers", async () => {
    const { redis } = redisLockFixture();
    const results = await Promise.all([
      withPublishingLease(redis, "one", async () => "one"),
      withPublishingLease(redis, "two", async () => "two"),
    ]);
    expect(results).toEqual([
      { acquired: true, value: "one" },
      { acquired: true, value: "two" },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never renews a stale token over a newer owner", async () => {
    const fixture = redisLockFixture();
    const first = createLeaderLock("token-fixture", 10);
    const second = createLeaderLock("token-fixture", 10);
    expect(await first.tryAcquire(fixture.redis)).toBe(true);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await second.tryAcquire(fixture.redis)).toBe(true);
    const current = { ...fixture.read("token-fixture")! };
    expect(await first.renew(fixture.redis)).toBe(false);
    expect(await first.release(fixture.redis)).toBe(false);
    expect(fixture.read("token-fixture")).toEqual(current);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await second.renew(fixture.redis)).toBe(true);
    expect(fixture.read("token-fixture")!.expiresAt).toBeGreaterThan(current.expiresAt);
  });
});
