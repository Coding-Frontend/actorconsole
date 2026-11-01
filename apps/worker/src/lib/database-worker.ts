import { EventEmitter } from "node:events";
import { UnrecoverableError } from "bullmq";
import { DatabaseQueue, DatabaseJobLeaseLostError } from "@actorconsole/db";
import type { QueueJob } from "@actorconsole/shared";

/** Polls a durable MySQL queue; the same processor is used in Redis mode. */
export class DatabaseWorker<T = any> extends EventEmitter {
  private stopping = false;
  private running?: Promise<void>;
  private wakes = new Set<() => void>();
  private queue: DatabaseQueue;

  constructor(
    public readonly name: string,
    private processor: (job: QueueJob<T>) => Promise<unknown>,
    private concurrency = 1,
  ) {
    super();
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new Error("Worker concurrency must be a positive integer");
    this.queue = new DatabaseQueue(name);
  }

  run(deadline = Number.POSITIVE_INFINITY, drain = false): Promise<void> {
    if (this.running) return this.running;
    const loop = async () => {
      while (!this.stopping && Date.now() < deadline) {
        try {
          const claim = await this.queue.claim();
          if (!claim) {
            if (drain) return;
            await this.pause();
            continue;
          }
          const job = claim.job as QueueJob<T>;
          let lost: Error | undefined;
          let renewal: Promise<void> | undefined;
          const heartbeat = setInterval(() => {
            if (renewal || lost) return;
            renewal = claim
              .renew()
              .catch((error) => {
                lost = error;
              })
              .finally(() => {
                renewal = undefined;
              });
          }, 15_000);
          try {
            const result = await this.processor(job);
            if (lost) throw lost;
            await claim.complete(result);
            this.emit("completed", job);
          } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            if (lost || failure instanceof DatabaseJobLeaseLostError) {
              this.emit("error", lost ?? failure);
            } else {
              await claim.fail(failure, failure instanceof UnrecoverableError);
              this.emit("failed", job, failure);
            }
          } finally {
            clearInterval(heartbeat);
            await renewal;
          }
        } catch (error) {
          this.emit("error", error);
          if (drain) throw error;
          await this.pause();
        }
      }
    };
    this.running = Promise.all(Array.from({ length: this.concurrency }, loop)).then(
      () => undefined,
    );
    return this.running;
  }

  private pause(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        this.wakes.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, 1000);
      this.wakes.add(wake);
    });
  }

  async close() {
    this.stopping = true;
    for (const wake of this.wakes) wake();
    await this.running;
  }
}
