import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  actorId: string;
  logoId: string;
  status: string;
  batchId: string | null;
  error: string | null;
  updatedAt: Date;
};

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  batch: null as null | Record<string, any>,
  audits: [] as unknown[],
  actorUpdates: [] as unknown[],
}));

function matches(row: Record<string, any>, where: Record<string, any> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "actor") return true;
    if (key === "OR") return (condition as any[]).some((part) => matches(row, part));
    const value = row[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return condition.in.includes(value);
      if ("notIn" in condition) return !condition.notIn.includes(value);
      if ("lt" in condition) return value < condition.lt;
    }
    return value === condition;
  });
}

const db = vi.hoisted(() => {
  const recommendation = {
    updateMany: vi.fn(async ({ where, data }: any) => {
      const hits = state.rows.filter((row) => matches(row, where));
      for (const row of hits) Object.assign(row, data, { updatedAt: new Date() });
      return { count: hits.length };
    }),
    findFirst: vi.fn(async ({ where, orderBy }: any) => {
      const hits = state.rows.filter((row) => matches(row, where));
      if (orderBy?.id === "asc") hits.sort((a, b) => a.id.localeCompare(b.id));
      return hits[0] ?? null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: any) => {
      const row = state.rows.find((item) => item.id === where.id)!;
      return {
        ...row,
        actor: {
          id: row.actorId,
          apifyActorId: `apify_${row.actorId}`,
          websiteIdentityId: "website_1",
          websiteIdentity: { status: "ACTIVE", currentLogoId: "logo_1" },
        },
        logo: {
          id: row.logoId,
          websiteIdentityId: "website_1",
          reviewStatus: row.logoId === "logo_1" ? "APPROVED" : "RETIRED",
          storagePath: `website-logos/website_1/${"a".repeat(64)}.webp`,
          checksum: "a".repeat(64),
          contentType: "image/webp",
        },
      };
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.rows.find((item) => item.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    count: vi.fn(async ({ where }: any) => state.rows.filter((row) => matches(row, where)).length),
  };
  const batch = {
    findFirst: vi.fn(async () => state.batch),
    findUnique: vi.fn(async () => state.batch),
    findMany: vi.fn(async ({ where }: any) =>
      state.batch && matches(state.batch, where) ? [state.batch] : [],
    ),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if (!state.batch || !matches(state.batch, where)) return { count: 0 };
      Object.assign(state.batch, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ data }: any) => Object.assign(state.batch!, data)),
  };
  return {
    actorLogoRecommendation: recommendation,
    actorLogoApplyBatch: batch,
    actor: { update: vi.fn(async (input: unknown) => state.actorUpdates.push(input)) },
    auditLog: { create: vi.fn(async (input: unknown) => state.audits.push(input)) },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
});

vi.mock("../../../../packages/db/src/client.js", () => ({ db }));
vi.mock("@actorconsole/db", async () => ({
  ...(await import("../../../../packages/db/src/actor-logo-recommendations.js")),
  db,
}));

import {
  dispatchPendingLogoApplyBatches,
  recoverStaleLogoApplyBatches,
  runLogoApplyBatch,
} from "../../src/lib/logo-apply-batches.js";

const payload = { batchId: "batch_1", userId: "user_1", businessProfileId: "workspace_1" };

function row(id: string, extra: Partial<Row> = {}): Row {
  return {
    id,
    actorId: `actor_${id}`,
    logoId: "logo_1",
    status: "QUEUED",
    batchId: "batch_1",
    error: null,
    updatedAt: new Date(),
    ...extra,
  };
}

function deps(updateActorMetadata = vi.fn()) {
  return {
    getApify: vi.fn(async () => ({ updateActorMetadata })),
    readLogo: vi.fn(async () => new Uint8Array([1, 2, 3])),
    delay: vi.fn(async () => undefined),
  };
}

describe("background logo apply batches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rows = [];
    state.audits = [];
    state.actorUpdates = [];
    state.batch = {
      id: "batch_1",
      ...payload,
      status: "QUEUED",
      jobId: null,
      total: 0,
      stopRequested: false,
      startedAt: null,
      createdAt: new Date("2026-11-28T00:00:00Z"),
    };
  });

  it("applies every queued logo once, one at a time, and records the totals", async () => {
    state.rows = [row("r1"), row("r2"), row("r3")];
    const updateActorMetadata = vi
      .fn()
      .mockResolvedValueOnce({ verified: true, pictureUrl: "https://apify/1.webp" })
      .mockRejectedValueOnce(new Error("Too Many Requests"))
      .mockResolvedValueOnce({ verified: true, pictureUrl: "https://apify/3.webp" });
    const options = deps(updateActorMetadata);

    const result = await runLogoApplyBatch("job_1", payload, options);

    expect(result).toMatchObject({ status: "COMPLETED", succeeded: 2, failed: 1 });
    expect(updateActorMetadata).toHaveBeenCalledTimes(3);
    expect(options.delay).toHaveBeenCalledTimes(2);
    expect(state.rows.map((item) => [item.id, item.status, item.error])).toEqual([
      ["r1", "APPLIED", null],
      ["r2", "PENDING", "Too Many Requests"],
      ["r3", "APPLIED", null],
    ]);
    expect(state.batch).toMatchObject({ status: "COMPLETED", succeededCount: 2, failedCount: 1 });
    expect(state.audits).toHaveLength(2);
  });

  it("does nothing when another worker already owns the batch", async () => {
    state.batch!.status = "RUNNING";
    state.batch!.jobId = "job_other";
    state.rows = [row("r1")];
    const options = deps();
    await expect(runLogoApplyBatch("job_1", payload, options)).resolves.toEqual({
      status: "ALREADY_CLAIMED",
    });
    expect(options.getApify).not.toHaveBeenCalled();
  });

  it("hands back rows a crashed attempt left mid-upload instead of uploading again", async () => {
    state.batch!.status = "RUNNING";
    state.batch!.jobId = "job_1";
    state.rows = [row("r1", { status: "APPLYING" })];
    const updateActorMetadata = vi.fn();
    await runLogoApplyBatch("job_1", payload, deps(updateActorMetadata));
    expect(updateActorMetadata).not.toHaveBeenCalled();
    expect(state.rows[0]).toMatchObject({
      status: "PENDING",
      error: expect.stringContaining("Could not confirm"),
    });
  });

  it("stops before the next Actor when a stop is requested", async () => {
    state.rows = [row("r1"), row("r2")];
    const updateActorMetadata = vi.fn(async () => {
      state.batch!.stopRequested = true;
      return { verified: true, pictureUrl: "https://apify/1.webp" };
    });
    const result = await runLogoApplyBatch("job_1", payload, deps(updateActorMetadata));
    expect(result).toMatchObject({ status: "STOPPED", succeeded: 1 });
    expect(updateActorMetadata).toHaveBeenCalledTimes(1);
    expect(state.rows[1]).toMatchObject({ status: "PENDING", batchId: null });
  });

  it("returns every row for review when publishing credentials are missing", async () => {
    state.rows = [row("r1"), row("r2")];
    const options = { ...deps(), getApify: vi.fn(async () => null) };
    const result = await runLogoApplyBatch("job_1", payload, options);
    expect(result).toMatchObject({ status: "FAILED" });
    expect(state.rows.every((item) => item.status === "PENDING" && item.error)).toBe(true);
  });

  it("marks a recommendation whose logo is no longer current as superseded", async () => {
    state.rows = [row("r1", { logoId: "logo_old" })];
    const updateActorMetadata = vi.fn();
    await runLogoApplyBatch("job_1", payload, deps(updateActorMetadata));
    expect(updateActorMetadata).not.toHaveBeenCalled();
    expect(state.rows[0]!.status).toBe("SUPERSEDED");
  });

  it("re-dispatches queued batches whose enqueue may have been lost", async () => {
    const queue = { add: vi.fn(async () => undefined) };
    await dispatchPendingLogoApplyBatches(queue, new Date("2026-11-28T00:05:00Z"));
    expect(queue.add).toHaveBeenCalledWith(
      "logo-apply-batch",
      { logoApplyBatch: payload },
      { jobId: "logo-apply-batch_1" },
    );
  });

  it("finishes a batch whose job died and hands its logos back to review", async () => {
    state.batch!.status = "RUNNING";
    state.batch!.updatedAt = new Date("2026-11-28T00:00:00Z");
    state.rows = [
      row("r1", { status: "APPLIED" }),
      row("r2", { status: "APPLYING" }),
      row("r3"),
    ];
    const recovered = await recoverStaleLogoApplyBatches(new Date("2026-11-28T00:30:00Z"));
    expect(recovered).toBe(1);
    expect(state.batch).toMatchObject({ status: "FAILED", succeededCount: 1, failedCount: 1 });
    expect(state.rows.map((item) => [item.id, item.status, item.batchId])).toEqual([
      ["r1", "APPLIED", "batch_1"],
      ["r2", "PENDING", "batch_1"],
      ["r3", "PENDING", null],
    ]);
    expect(state.rows[1]!.error).toContain("Could not confirm");
  });

  it("leaves a batch alone while it is still making progress", async () => {
    state.batch!.status = "RUNNING";
    state.batch!.updatedAt = new Date("2026-11-28T00:25:00Z");
    state.rows = [row("r1")];
    expect(await recoverStaleLogoApplyBatches(new Date("2026-11-28T00:30:00Z"))).toBe(0);
    expect(state.batch!.status).toBe("RUNNING");
  });
});
