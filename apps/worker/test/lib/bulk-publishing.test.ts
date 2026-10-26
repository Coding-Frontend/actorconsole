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

  it.each(["RUNNING", "READY", "STARTING", "STOPPING", "ABORTING", "TIMING-OUT"])("does not start a duplicate validation run while the existing run remains %s", async (status) => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([run("run-1", status)]),
      startActorRun: vi.fn().mockResolvedValue(run("run-2", "READY")),
      waitForRun: vi.fn().mockResolvedValue(run("run-1", status)),
    };

    await expect(ensureSuccessfulActorRun(apify, "actor-1", {}, 120)).rejects.toThrow(
      "Actor validation run run-1 is still in progress",
    );
    expect(apify.startActorRun).not.toHaveBeenCalled();
    expect(apify.waitForRun).toHaveBeenCalledTimes(1);
  });

  it("waits for a timing-out run that still succeeds without starting a replacement", async () => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([run("run-1", "TIMING-OUT")]),
      startActorRun: vi.fn().mockResolvedValue(run("run-2", "READY")),
      waitForRun: vi.fn(async (id: string) => run(id, "SUCCEEDED")),
    };

    expect(await ensureSuccessfulActorRun(apify, "actor-1")).toMatchObject({ started: false, run: { id: "run-1" } });
    expect(apify.startActorRun).not.toHaveBeenCalled();
  });

  it.each(["UNRECOGNIZED", ""])("does not replace an unconfirmed terminal state %j", async (status) => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([run("run-1", status)]),
      startActorRun: vi.fn().mockResolvedValue(run("run-2", "READY")),
      waitForRun: vi.fn(async (id: string) => run(id, status)),
    };

    await expect(ensureSuccessfulActorRun(apify, "actor-1")).rejects.toThrow("still in progress");
    expect(apify.startActorRun).not.toHaveBeenCalled();
  });

  it.each(["FAILED", "ABORTED", "TIMED-OUT"])("replaces a confirmed terminal %s run once", async (status) => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([run("run-1", status)]),
      startActorRun: vi.fn().mockResolvedValue(run("run-2", "READY")),
      waitForRun: vi.fn().mockResolvedValue(run("run-2", "SUCCEEDED")),
    };

    expect(await ensureSuccessfulActorRun(apify, "actor-1")).toMatchObject({ started: true, run: { id: "run-2" } });
    expect(apify.startActorRun).toHaveBeenCalledTimes(1);
    expect(apify.waitForRun).toHaveBeenCalledWith("run-2", 900);
  });

  it("reuses a successful run that finishes during the wait", async () => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([run("run-1", "RUNNING")]),
      startActorRun: vi.fn(),
      waitForRun: vi.fn().mockResolvedValue(run("run-1", "SUCCEEDED")),
    };
    expect(await ensureSuccessfulActorRun(apify, "actor-1")).toMatchObject({ started: false, run: { id: "run-1" } });
    expect(apify.startActorRun).not.toHaveBeenCalled();
  });

  it("keeps a newly started unfinished run retryable without publishing", async () => {
    const apify = {
      listActorRuns: vi.fn().mockResolvedValue([]),
      startActorRun: vi.fn().mockResolvedValue(run("run-1", "READY")),
      waitForRun: vi.fn().mockResolvedValue(run("run-1", "RUNNING")),
    };
    const error = await ensureSuccessfulActorRun(apify, "actor-1").catch((failure: Error) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(resolveBulkPublishingFailure(error, false)).toMatchObject({ retryable: true });
    expect(apify.startActorRun).toHaveBeenCalledTimes(1);
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
