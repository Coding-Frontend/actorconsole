import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: vi.fn(),
  bull: vi.fn(),
  database: vi.fn(),
  add: vi.fn(),
  get: vi.fn(),
}));
vi.mock("ioredis", () => ({ default: mocks.redis }));
vi.mock("bullmq", () => ({ Queue: mocks.bull }));
vi.mock("@actorconsole/db", () => ({ DatabaseQueue: mocks.database }));
import { enqueue, getRedis, getQueuedJob } from "../../src/lib/queue.js";

beforeEach(() => {
  vi.clearAllMocks();
  global.__redis = undefined;
  global.__queues = undefined;
  const queue = { add: mocks.add, getJob: mocks.get };
  mocks.bull.mockImplementation(() => queue);
  mocks.database.mockImplementation(() => queue);
  mocks.add.mockResolvedValue({ id: "persisted-job" });
  mocks.get.mockResolvedValue({ id: "persisted-job", data: { actorId: "a1" } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  global.__redis = undefined;
  global.__queues = undefined;
});
describe("queue backend routing", () => {
  it("persists and reads jobs without constructing Redis when disabled", async () => {
    vi.stubEnv("REDIS_ENABLED", "false");
    vi.stubEnv("REDIS_URL", "redis://unreachable:6379");
    expect(getRedis()).toBeNull();
    expect(await enqueue("snapshots", { actorId: "a1" })).toBe("persisted-job");
    expect(await getQueuedJob("snapshots", "persisted-job")).toMatchObject({ id: "persisted-job" });
    expect(mocks.database).toHaveBeenCalledWith("snapshots");
    expect(mocks.redis).not.toHaveBeenCalled();
    expect(mocks.bull).not.toHaveBeenCalled();
  });
  it("uses BullMQ with the same retry defaults when enabled", async () => {
    vi.stubEnv("REDIS_ENABLED", "true");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    expect(await enqueue("schedules", { bulkPublishScheduleId: "s1" }, { attempts: 5 })).toBe(
      "persisted-job",
    );
    expect(mocks.redis).toHaveBeenCalledTimes(1);
    expect(mocks.bull).toHaveBeenCalledTimes(1);
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.add).toHaveBeenCalledWith(
      "schedules",
      { bulkPublishScheduleId: "s1" },
      expect.objectContaining({ attempts: 5, backoff: { type: "exponential", delay: 5000 } }),
    );
  });
  it("surfaces storage failures without acknowledging or switching backends", async () => {
    vi.stubEnv("REDIS_ENABLED", "false");
    mocks.add.mockRejectedValue(new Error("database unavailable"));
    await expect(enqueue("snapshots", { actorId: "a1" })).rejects.toThrow("database unavailable");
    expect(mocks.bull).not.toHaveBeenCalled();
  });
});
