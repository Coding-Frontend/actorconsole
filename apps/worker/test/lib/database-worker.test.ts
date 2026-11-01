import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
const mocks = vi.hoisted(() => ({ claim: vi.fn() }));
vi.mock("@actorconsole/db", () => ({
  DatabaseQueue: class {
    claim = mocks.claim;
  },
  DatabaseJobLeaseLostError: class extends Error {},
}));
import { DatabaseWorker } from "../../src/lib/database-worker.js";

function claim() {
  return {
    job: { id: "job-1", data: {}, attemptsMade: 0, opts: { attempts: 2 } },
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    renew: vi.fn().mockResolvedValue(undefined),
  };
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());
describe("database worker", () => {
  it("drains available work then exits without waiting for future jobs", async () => {
    const task = claim();
    mocks.claim.mockResolvedValueOnce(task).mockResolvedValue(null);
    const process = vi.fn().mockResolvedValue({ done: true });
    const worker = new DatabaseWorker("snapshots", process);
    const completed = vi.fn();
    worker.on("completed", completed);
    await worker.run(Date.now() + 1000, true);
    expect(process).toHaveBeenCalledWith(task.job);
    expect(task.complete).toHaveBeenCalledWith({ done: true });
    expect(completed).toHaveBeenCalledTimes(1);
    await worker.close();
  });
  it("persists failures and recognizes unrecoverable errors", async () => {
    const task = claim();
    mocks.claim.mockResolvedValueOnce(task).mockResolvedValue(null);
    const error = new UnrecoverableError("denied");
    const worker = new DatabaseWorker("optimization", async () => {
      throw error;
    });
    await worker.run(Date.now() + 1000, true);
    expect(task.fail).toHaveBeenCalledWith(error, true);
    expect(task.complete).not.toHaveBeenCalled();
    await worker.close();
  });
  it("renews running jobs and refuses to complete after renewal fails", async () => {
    vi.useFakeTimers();
    const task = claim();
    const lost = new Error("lease expired");
    task.renew.mockRejectedValue(lost);
    mocks.claim.mockResolvedValueOnce(task).mockResolvedValue(null);
    let finish!: () => void;
    const worker = new DatabaseWorker(
      "catalog",
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const errors = vi.fn();
    worker.on("error", errors);
    const running = worker.run(Date.now() + 60_000, true);
    await vi.advanceTimersByTimeAsync(15_001);
    finish();
    await running;
    expect(errors).toHaveBeenCalledWith(lost);
    expect(task.complete).not.toHaveBeenCalled();
    expect(task.fail).not.toHaveBeenCalled();
    await worker.close();
  });
  it("stops claiming new jobs when its cron budget is exhausted", async () => {
    const worker = new DatabaseWorker("catalog", vi.fn());
    await worker.run(Date.now() - 1, true);
    expect(mocks.claim).not.toHaveBeenCalled();
    await worker.close();
  });
  it("wakes idle loops immediately on shutdown", async () => {
    mocks.claim.mockResolvedValue(null);
    const worker = new DatabaseWorker("snapshots", vi.fn());
    const running = worker.run();
    await Promise.resolve();
    await worker.close();
    await running;
  });
});
