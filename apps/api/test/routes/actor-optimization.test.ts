import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const { mockDb, mockEnqueue, mockAudit } = vi.hoisted(() => ({
  mockDb: {
    actor: { findMany: vi.fn() },
    actorOptimizationRun: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    actorOptimizationResult: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockEnqueue: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({ db: mockDb, Prisma: { JsonNull: null } }));
vi.mock("../../src/lib/queue.js", () => ({ enqueue: mockEnqueue }));
vi.mock("../../src/lib/user-audit.js", () => ({ recordUserAudit: mockAudit }));
vi.mock("../../src/lib/plan-access.js", () => ({
  assertPlanFeature: vi.fn(),
  assertFeatureEnabled: vi.fn(),
}));

import { actorOptimizationRoutes } from "../../src/routes/actor-optimization.js";

function buildApp(authMethod: "session" | "api-key" = "session") {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.use("/*", async (c: any, next) => {
    c.set("session", {
      userId: "user_1",
      email: "owner@example.com",
      plan: "PRO",
      businessProfileId: "workspace_1",
      authMethod,
    });
    await next();
  });
  app.route("/actors", actorOptimizationRoutes);
  return app;
}

describe("Actor optimization approval routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.actor.findMany.mockResolvedValue([
      { id: "actor_1", apifyActorId: "owner~actor-1" },
      { id: "actor_2", apifyActorId: "owner~actor-2" },
    ]);
    mockDb.actorOptimizationRun.create.mockResolvedValue({
      id: "run_1",
      results: [
        { id: "result_1", actorId: "actor_1" },
        { id: "result_2", actorId: "actor_2" },
      ],
    });
    mockDb.$transaction.mockImplementation(async (operations) =>
      typeof operations === "function" ? operations(mockDb) : Promise.all(operations),
    );
    mockDb.actorOptimizationResult.update.mockResolvedValue({});
    mockDb.actorOptimizationResult.updateMany.mockResolvedValue({ count: 0 });
    mockDb.actorOptimizationRun.update.mockResolvedValue({});
    mockEnqueue.mockResolvedValue("job_1");
    mockAudit.mockResolvedValue(undefined);
  });

  it("queues read-only audits for the selected workspace Actors", async () => {
    const response = await buildApp().request("/actors/optimization/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorIds: ["actor_1", "actor_2"] }),
    });

    expect(response.status).toBe(202);
    expect(mockDb.actor.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: { in: ["actor_1", "actor_2"] } },
          { apifyActorId: { in: ["actor_1", "actor_2"] } },
        ],
        userId: "user_1",
        businessProfileId: "workspace_1",
      },
      select: { id: true, apifyActorId: true },
    });
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenNthCalledWith(
      1,
      "optimization",
      { action: "audit", resultId: "result_1" },
      { jobId: "actor-optimization-audit-result_1" },
    );
  });

  it("records focused generation fields and the run kind", async () => {
    const response = await buildApp().request("/actors/optimization/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorIds: ["actor_1", "actor_2"],
        kind: "UPDATE_PRICING",
        fields: ["pricing"],
      }),
    });

    expect(response.status).toBe(202);
    expect(mockDb.actorOptimizationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "UPDATE_PRICING",
          requestedFields: ["pricing"],
        }),
      }),
    );
  });

  it("rejects legacy README and schema generation requests", async () => {
    for (const body of [
      { actorIds: ["actor_1"], kind: "REWRITE_README", fields: ["readme"] },
      { actorIds: ["actor_1"], kind: "GENERATE_OUTPUT_SCHEMA", fields: ["outputSchema"] },
    ]) {
      const response = await buildApp().request("/actors/optimization/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("lists bulk and single-Actor generations for the active workspace", async () => {
    mockDb.actorOptimizationRun.findMany.mockResolvedValue([{ id: "run_1" }]);
    mockDb.actorOptimizationRun.count.mockResolvedValue(1);
    mockDb.$transaction.mockResolvedValue([[{ id: "run_1" }], 1]);

    const response = await buildApp().request(
      "/actors/optimization/runs?kind=REWRITE_COPY&limit=20",
    );

    expect(response.status).toBe(200);
    expect(mockDb.actorOptimizationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user_1",
          businessProfileId: "workspace_1",
          kind: "REWRITE_COPY",
        }),
      }),
    );
  });

  it("requires an idempotency key when an MCP credential approves changes", async () => {
    mockDb.actorOptimizationRun.findFirst.mockResolvedValue({
      id: "run_1",
      requestedFields: ["title"],
      approvalIdempotencyKey: null,
      approvalRequestHash: null,
      results: [
        {
          id: "result_1",
          status: "READY_FOR_APPROVAL",
          actor: { apifyActorId: "owner~actor-1" },
        },
      ],
    });
    const response = await buildApp("api-key").request("/actors/optimization/runs/run_1/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ resultId: "result_1", fields: ["title"] }] }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("idempotency_key_required");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("records exact field approval before queuing application", async () => {
    mockDb.actorOptimizationRun.findFirst.mockResolvedValue({
      id: "run_1",
      requestedFields: ["title", "description", "pricing"],
      approvalIdempotencyKey: null,
      approvalRequestHash: null,
      results: [
        {
          id: "result_1",
          status: "READY_FOR_APPROVAL",
          actor: { apifyActorId: "owner~actor-1" },
        },
      ],
    });
    const response = await buildApp().request("/actors/optimization/runs/run_1/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            resultId: "result_1",
            fields: ["title", "description", "pricing"],
          },
        ],
      }),
    });

    expect(response.status).toBe(202);
    expect(mockDb.actorOptimizationResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "result_1" },
        data: expect.objectContaining({
          status: "APPROVED",
          approvedFields: ["title", "description", "pricing"],
        }),
      }),
    );
    expect(mockEnqueue).toHaveBeenCalledWith(
      "optimization",
      { action: "apply", resultId: "result_1" },
      { jobId: "actor-optimization-apply-result_1" },
    );
  });

  describe("rechecking improvement results", () => {
    function result(status: string) {
      return {
        id: "result_1",
        runId: "run_1",
        status,
        updatedAt: new Date("2026-10-01T12:00:00Z"),
        actor: { apifyActorId: "owner~actor-1" },
      };
    }

    it.each(["QUEUED", "AUDITING", "APPROVED", "APPLYING"])(
      "rejects rechecks of an active %s result without changing counters",
      async (status) => {
        mockDb.actorOptimizationResult.findFirst.mockResolvedValue(result(status));
        const response = await buildApp().request("/actors/optimization/results/result_1/recheck", {
          method: "POST",
        });

        expect(response.status).toBe(409);
        expect(mockDb.actorOptimizationResult.update).not.toHaveBeenCalled();
        expect(mockDb.actorOptimizationRun.update).not.toHaveBeenCalled();
        expect(mockEnqueue).not.toHaveBeenCalled();
      },
    );

    it("queues a failed result once and adjusts only its failed counter", async () => {
      mockDb.actorOptimizationResult.findFirst.mockResolvedValue(result("FAILED"));
      mockDb.actorOptimizationResult.updateMany.mockResolvedValue({ count: 1 });

      const response = await buildApp().request("/actors/optimization/results/result_1/recheck", {
        method: "POST",
      });

      expect(response.status).toBe(202);
      expect(mockDb.actorOptimizationResult.updateMany).toHaveBeenCalledWith({
        where: { id: "result_1", status: "FAILED", updatedAt: result("FAILED").updatedAt },
        data: expect.objectContaining({ status: "QUEUED", approvedAt: null }),
      });
      expect(mockDb.actorOptimizationRun.update).toHaveBeenCalledWith({
        where: { id: "run_1" },
        data: expect.objectContaining({ status: "RUNNING", failedCount: { decrement: 1 } }),
      });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
    });

    it("rejects a concurrent recheck that already lost its result claim", async () => {
      mockDb.actorOptimizationResult.findFirst.mockResolvedValue(result("STALE"));
      mockDb.actorOptimizationResult.updateMany.mockResolvedValue({ count: 0 });

      const response = await buildApp().request("/actors/optimization/results/result_1/recheck", {
        method: "POST",
      });

      expect(response.status).toBe(409);
      expect(mockDb.actorOptimizationRun.update).not.toHaveBeenCalled();
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it.each(["READY_FOR_APPROVAL", "STALE", "APPLY_FAILED", "APPLIED"])(
      "removes a terminal %s result from the right counters before rechecking",
      async (status) => {
        mockDb.actorOptimizationResult.findFirst.mockResolvedValue(result(status));
        mockDb.actorOptimizationResult.updateMany.mockResolvedValue({ count: 1 });
        const response = await buildApp().request("/actors/optimization/results/result_1/recheck", { method: "POST" });

        expect(response.status).toBe(202);
        const data = mockDb.actorOptimizationRun.update.mock.calls[0][0].data;
        expect(data.completedCount).toEqual({ decrement: 1 });
        expect(data.failedCount).toBeUndefined();
        expect(data.appliedCount).toEqual(status === "APPLIED" ? { decrement: 1 } : undefined);
        expect(mockDb.actorOptimizationResult.updateMany.mock.calls[0][0].data).toMatchObject({ approvedFields: null, approvedAt: null, appliedAt: null });
      },
    );

    it("permits one claim and one counter update for simultaneous requests", async () => {
      mockDb.actorOptimizationResult.findFirst.mockResolvedValue(result("STALE"));
      let claimed = false;
      mockDb.actorOptimizationResult.updateMany.mockImplementation(async () => {
        if (claimed) return { count: 0 };
        claimed = true;
        return { count: 1 };
      });
      const app = buildApp();
      const responses = await Promise.all([
        app.request("/actors/optimization/results/result_1/recheck", { method: "POST" }),
        app.request("/actors/optimization/results/result_1/recheck", { method: "POST" }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([202, 409]);
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockDb.actorOptimizationRun.update).toHaveBeenCalledTimes(1);
    });

    it("does not finish a failed recheck while other results are still running", async () => {
      mockDb.actorOptimizationResult.findFirst.mockResolvedValue(result("FAILED"));
      mockDb.actorOptimizationResult.updateMany.mockResolvedValue({ count: 1 });
      mockDb.actorOptimizationRun.update.mockResolvedValue({ totalCount: 2, completedCount: 0, failedCount: 1 });
      mockEnqueue.mockResolvedValue(null);
      const response = await buildApp().request("/actors/optimization/results/result_1/recheck", { method: "POST" });
      expect(response.status).toBe(503);
      expect(mockDb.actorOptimizationRun.update).toHaveBeenCalledTimes(2);
      expect(mockDb.actorOptimizationRun.update).toHaveBeenLastCalledWith({ where: { id: "run_1" }, data: { failedCount: { increment: 1 } } });
    });

    it.each(["null", "exception"])(
      "records a terminal failure when enqueue returns %s",
      async (failure) => {
        mockDb.actorOptimizationResult.findFirst.mockResolvedValue(result("FAILED"));
        mockDb.actorOptimizationResult.updateMany.mockResolvedValue({ count: 1 });
        mockDb.actorOptimizationRun.update.mockResolvedValue({
          totalCount: 1, completedCount: 0, failedCount: 1,
        });
        if (failure === "exception") mockEnqueue.mockRejectedValue(new Error("Redis unavailable"));
        else mockEnqueue.mockResolvedValue(null);

        const response = await buildApp().request("/actors/optimization/results/result_1/recheck", {
          method: "POST",
        });

        expect(response.status).toBe(503);
        expect((await response.json()).error.code).toBe("queue_unavailable");
        expect(mockDb.actorOptimizationResult.update).toHaveBeenCalledWith({
          where: { id: "result_1" },
          data: { status: "FAILED", error: "The optimization queue is unavailable" },
        });
        expect(mockDb.actorOptimizationRun.update).toHaveBeenLastCalledWith({
          where: { id: "run_1" },
          data: expect.objectContaining({ status: "FAILED" }),
        });
      },
    );
  });
});
