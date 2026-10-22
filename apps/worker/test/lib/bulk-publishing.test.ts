import { describe, expect, it, vi } from "vitest";
import {
  BULK_PUBLISH_ELIGIBLE_ACTOR_STATUSES,
  ensureSuccessfulActorRun,
  resolveBulkPublishingFailure,
} from "../../src/lib/bulk-publishing";

describe("bulk publishing failure outcomes", () => {
  it("blocks a metadata-invalid Actor so future daily runs exclude it", () => {
    const outcome = resolveBulkPublishingFailure(
      new Error("Invalid value provided in the Actor update data: default build has no README"),
      false,
    );

    expect(outcome).toMatchObject({
      actorStatus: "BLOCKED",
      resultStatus: "BLOCKED",
      retryable: false,
      code: "MISSING_README",
    });
    expect(BULK_PUBLISH_ELIGIBLE_ACTOR_STATUSES).not.toContain(outcome.actorStatus);
  });

  it("moves exhausted transient failures aside until a user explicitly retries them", () => {
    expect(resolveBulkPublishingFailure(new Error("HTTP 503"), false)).toMatchObject({
      actorStatus: "FAILED",
      resultStatus: "FAILED",
      retryable: true,
    });
    expect(BULK_PUBLISH_ELIGIBLE_ACTOR_STATUSES).not.toContain("FAILED");
  });

  it("stops on quota while keeping the Actor eligible for the next daily run", () => {
    expect(resolveBulkPublishingFailure(new Error("daily limit"), true)).toMatchObject({
      actorStatus: "QUOTA_BLOCKED",
      resultStatus: "QUOTA_BLOCKED",
      retryable: true,
      code: "APIFY_DAILY_PUBLICATION_LIMIT",
    });
    expect(BULK_PUBLISH_ELIGIBLE_ACTOR_STATUSES).toContain("QUOTA_BLOCKED");
  });
});

describe("ensureSuccessfulActorRun", () => {
  function run(id: string, status: string) {
    return { id, actId: "actor-1", status, startedAt: "2026-09-15T00:00:00.000Z" };
  }

  it("starts and waits for a validation run when the Actor has no runs", async () => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([]),
      startActorRun: vi.fn().mockResolvedValue(run("run-1", "READY")),
      waitForRun: vi.fn().mockResolvedValue(run("run-1", "SUCCEEDED")),
    };

    const result = await ensureSuccessfulActorRun(apify, "actor-1", { keyword: "apify" }, 120);

    expect(result).toMatchObject({ started: true, run: { id: "run-1", status: "SUCCEEDED" } });
    expect(apify.listActorRuns).toHaveBeenCalledWith("actor-1", { limit: 1, desc: true });
    expect(apify.startActorRun).toHaveBeenCalledWith("actor-1", { keyword: "apify" });
    expect(apify.waitForRun).toHaveBeenCalledWith("run-1", 120);
  });

  it("reuses an existing successful run without starting another run", async () => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([run("run-1", "SUCCEEDED")]),
      startActorRun: vi.fn(),
      waitForRun: vi.fn(),
    };

    const result = await ensureSuccessfulActorRun(apify, "actor-1");

    expect(result).toMatchObject({ started: false, run: { id: "run-1", status: "SUCCEEDED" } });
    expect(apify.startActorRun).not.toHaveBeenCalled();
    expect(apify.waitForRun).not.toHaveBeenCalled();
  });

  it("waits for an existing run before starting a replacement when it fails", async () => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([run("run-1", "RUNNING")]),
      startActorRun: vi.fn().mockResolvedValue(run("run-2", "READY")),
      waitForRun: vi
        .fn()
        .mockResolvedValueOnce(run("run-1", "FAILED"))
        .mockResolvedValueOnce(run("run-2", "SUCCEEDED")),
    };

    const result = await ensureSuccessfulActorRun(apify, "actor-1");

    expect(result).toMatchObject({ started: true, run: { id: "run-2", status: "SUCCEEDED" } });
    expect(apify.startActorRun).toHaveBeenCalledWith("actor-1", {});
    expect(apify.waitForRun).toHaveBeenNthCalledWith(1, "run-1", 900);
    expect(apify.waitForRun).toHaveBeenNthCalledWith(2, "run-2", 900);
  });

  it("does not publish when the validation run does not succeed", async () => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([]),
      startActorRun: vi.fn().mockResolvedValue(run("run-1", "READY")),
      waitForRun: vi.fn().mockResolvedValue(run("run-1", "FAILED")),
    };

    await expect(ensureSuccessfulActorRun(apify, "actor-1")).rejects.toThrow(
      "Actor validation run run-1 finished with status FAILED",
    );
  });
});
