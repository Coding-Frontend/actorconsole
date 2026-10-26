import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const { mockDb, mockApify, mockEnqueue, mockGetQueuedJob, mockAudit, mockAssertPlanFeature } =
  vi.hoisted(() => ({
    mockDb: {
      actor: {
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      bulkPublishSchedule: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      bulkPublishScheduleActor: {
        updateMany: vi.fn(),
      },
      bulkPublishScheduleRun: {
        findFirst: vi.fn(),
      },
      apifyToken: {
        findUnique: vi.fn(),
      },
      bulkActorStatusOperation: {
        updateMany: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    mockApify: {
      listMyActors: vi.fn(),
      getActorBasicInfo: vi.fn(),
      getActor: vi.fn(),
      updateActorStoreStatus: vi.fn(),
    },
    mockEnqueue: vi.fn(),
    mockGetQueuedJob: vi.fn(),
    mockAudit: vi.fn(),
    mockAssertPlanFeature: vi.fn(),
  }));

vi.mock("@actorconsole/db", () => ({ db: mockDb }));
vi.mock("@actorconsole/apify", () => ({
  getUserApifyClient: vi.fn().mockImplementation(async () => mockApify),
}));
vi.mock("../../src/lib/queue.js", () => ({
  enqueue: mockEnqueue,
  getQueuedJob: mockGetQueuedJob,
}));
vi.mock("../../src/lib/user-audit.js", () => ({ recordUserAudit: mockAudit }));
vi.mock("../../src/lib/plan-access.js", () => ({ assertPlanFeature: mockAssertPlanFeature }));

import { bulkPublishingRoutes } from "../../src/routes/bulk-publishing.js";

const actor = {
  id: "actor_1",
  userId: "user_1",
  businessProfileId: "workspace_1",
  apifyActorId: "owner~actor",
  username: "owner",
  actorName: "actor",
  title: "Actor",
  currentImageUrl: null,
  storeIsPublic: true,
  storeIsDeprecated: false,
  storeNotice: "NONE",
  storeStatusSyncedAt: new Date("2026-08-11T00:00:00.000Z"),
  publishReady: false,
  hasDescription: true,
  hasReadme: false,
  hasInputSchema: false,
  hasOutputSchema: false,
  hasKeyValueSchema: false,
  readinessSyncedAt: new Date("2026-08-11T00:00:00.000Z"),
};

function buildApp() {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.use("/*", async (c: any, next) => {
    c.set("session", {
      userId: "user_1",
      email: "owner@example.com",
      plan: "PRO",
      businessProfileId: "workspace_1",
    });
    await next();
  });
  app.route("/", bulkPublishingRoutes);
  return app;
}

describe("bulk publishing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.actor.findMany.mockResolvedValue([actor]);
    mockDb.actor.count.mockResolvedValue(1);
    mockDb.actor.update.mockResolvedValue(actor);
    mockDb.actor.upsert.mockResolvedValue(actor);
    mockApify.listMyActors.mockResolvedValue([]);
    mockApify.getActorBasicInfo.mockResolvedValue({
      isPublic: true,
      isDeprecated: false,
      notice: "NONE",
    });
    mockApify.getActor.mockResolvedValue(null);
    mockDb.bulkPublishSchedule.findMany.mockResolvedValue([]);
    mockDb.bulkPublishSchedule.update.mockResolvedValue({});
    mockDb.bulkPublishScheduleActor.updateMany.mockResolvedValue({ count: 1 });
    mockDb.bulkPublishScheduleRun.findFirst.mockResolvedValue(null);
    mockDb.apifyToken.findUnique.mockResolvedValue({
      encryptedToken: "encrypted-api-key",
      apiTokenStatus: "VALID",
      validationError: null,
    });
    mockDb.bulkActorStatusOperation.findMany.mockResolvedValue([]);
    mockDb.bulkActorStatusOperation.findFirst.mockResolvedValue(null);
    mockDb.bulkActorStatusOperation.updateMany.mockResolvedValue({ count: 1 });
    mockDb.bulkActorStatusOperation.count.mockResolvedValue(0);
    mockDb.bulkActorStatusOperation.create.mockResolvedValue({ id: "operation_1" });
    mockDb.bulkActorStatusOperation.update.mockResolvedValue({ id: "operation_1" });
    mockAudit.mockResolvedValue(undefined);
    mockEnqueue.mockResolvedValue("job_1");
  });

  it("requires idempotency for MCP publishing mutations", async () => {
    const response = await buildApp().request("/schedules", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actorconsole-client": "mcp",
      },
      body: JSON.stringify({ name: "MCP queue", actorIds: ["actor_1"] }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("idempotency_key_required");
    expect(mockDb.bulkPublishSchedule.create).not.toHaveBeenCalled();
  });

  it("includes failed default-build reads in the unknown readiness filter", async () => {
    const response = await buildApp().request("/inventory?readiness=unknown");
    expect(response.status).toBe(200);
    expect(mockDb.actor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ readinessSyncedAt: null }, { publishReady: null }] },
          ]),
        }),
      }),
    );
  });

  it("filters the workspace Actor inventory by Store status", async () => {
    const response = await buildApp().request("/inventory?status=maintenance&q=actor");

    expect(response.status).toBe(200);
    expect(mockDb.actor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user_1",
          businessProfileId: "workspace_1",
          AND: expect.arrayContaining([
            { storeNotice: "UNDER_MAINTENANCE" },
            expect.objectContaining({ OR: expect.any(Array) }),
          ]),
        }),
      }),
    );
  });

  it.each([
    ["published", { storeIsPublic: true }],
    ["private", { storeIsPublic: false }],
    ["maintenance", { storeNotice: "UNDER_MAINTENANCE" }],
    ["deprecated", { storeIsDeprecated: true }],
  ])("filters %s independently from the other lifecycle fields", async (status, expected) => {
    const response = await buildApp().request(`/inventory?status=${status}`);

    expect(response.status).toBe(200);
    const query = mockDb.actor.findMany.mock.calls.at(-1)?.[0];
    expect(query.where.AND).toContainEqual(expected);
    if (status === "private" || status === "published") {
      expect(query.where.AND).not.toContainEqual(
        expect.objectContaining({ storeIsDeprecated: false }),
      );
      expect(query.where.AND).not.toContainEqual(
        expect.objectContaining({ NOT: { storeNotice: "UNDER_MAINTENANCE" } }),
      );
    }
  });

  it("returns every filtered Actor for selection across pagination", async () => {
    mockDb.actor.findMany.mockResolvedValueOnce([actor, { ...actor, id: "actor_2" }]);

    const response = await buildApp().request(
      "/inventory/selection?status=private&readiness=missing-readme&q=scraper",
    );

    expect(response.status).toBe(200);
    expect(mockDb.actor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10_000,
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ storeIsPublic: false }),
            { hasReadme: false },
            expect.objectContaining({ OR: expect.any(Array) }),
          ]),
        }),
      }),
    );
    expect((await response.json()).data.items).toHaveLength(2);
  });

  it("queues a deduplicated publishing inventory refresh without blocking on Apify", async () => {
    const response = await buildApp().request("/inventory/refresh", { method: "POST" });

    expect(response.status).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "snapshots",
      {
        workspaceInventory: {
          userId: "user_1",
          businessProfileId: "workspace_1",
        },
      },
      expect.objectContaining({
        jobId: expect.stringMatching(/^publishing-inventory-workspace_1-/),
        lifo: true,
      }),
    );
    expect(mockApify.listMyActors).not.toHaveBeenCalled();
    expect(mockApify.getActorBasicInfo).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { jobId: "job_1", state: "queued" },
    });
  });

  it("returns publishing inventory refresh progress for the active workspace", async () => {
    mockGetQueuedJob.mockResolvedValue({
      id: "job_1",
      data: {
        workspaceInventory: { userId: "user_1", businessProfileId: "workspace_1" },
      },
      getState: vi.fn().mockResolvedValue("active"),
      progress: { total: 863, completed: 40, verifiedStatuses: 39 },
      returnvalue: null,
      failedReason: null,
    });

    const response = await buildApp().request("/inventory/refresh/job_1");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        jobId: "job_1",
        state: "active",
        progress: { total: 863, completed: 40, verifiedStatuses: 39 },
      },
    });
  });

  it("persists and queues lifecycle updates for every selected Actor", async () => {
    const response = await buildApp().request("/actors/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorIds: ["actor_1"],
        underMaintenance: false,
        isDeprecated: false,
      }),
    });

    expect(response.status).toBe(202);
    expect(mockDb.bulkActorStatusOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CLEAR_MAINTENANCE",
        underMaintenance: false,
        isDeprecated: false,
        actorCount: 1,
        items: {
          create: [
            expect.objectContaining({
              actorId: "actor_1",
              apifyActorId: "owner~actor",
              label: "Actor",
              position: 0,
            }),
          ],
        },
      }),
    });
    expect(mockEnqueue).toHaveBeenCalledWith("schedules", {
      bulkActorStatus: {
        operationId: "operation_1",
        userId: "user_1",
        businessProfileId: "workspace_1",
      },
    }, { jobId: "actor-status-operation_1" });
    expect((await response.json()).data).toMatchObject({
      queued: 1,
      jobId: "actor-status-operation_1",
      operationId: "operation_1",
    });
  });

  it("clears deprecated status whenever maintenance is cleared", async () => {
    const response = await buildApp().request("/actors/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorIds: ["actor_1"], underMaintenance: false }),
    });

    expect(response.status).toBe(202);
    expect(mockDb.bulkActorStatusOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CLEAR_MAINTENANCE",
        underMaintenance: false,
        isDeprecated: false,
      }),
    });
  });

  it("retains dispatch intent when the queue acknowledgement is unavailable", async () => {
    mockEnqueue.mockResolvedValueOnce(null);

    const response = await buildApp().request("/actors/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorIds: ["actor_1"], isDeprecated: true }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ data: { operationId: "operation_1", jobId: "actor-status-operation_1", dispatchPending: true } });
    expect(mockDb.bulkActorStatusOperation.updateMany).toHaveBeenCalledWith({
      where: { id: "operation_1", status: "QUEUED" },
      data: { error: expect.stringContaining("acknowledgement is pending") },
    });

  });

  it("rejects clearing maintenance while marking the Actor deprecated", async () => {
    const response = await buildApp().request("/actors/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorIds: ["actor_1"],
        underMaintenance: false,
        isDeprecated: true,
      }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_status_change");
    expect(mockDb.bulkActorStatusOperation.create).not.toHaveBeenCalled();
  });

  it("returns durable status-operation history for the active workspace", async () => {
    mockDb.bulkActorStatusOperation.findMany.mockResolvedValue([
      { id: "operation_1", action: "CLEAR_MAINTENANCE", status: "SUCCEEDED" },
    ]);
    mockDb.bulkActorStatusOperation.count.mockResolvedValue(1);

    const response = await buildApp().request("/status-operations?page=1&limit=20");

    expect(response.status).toBe(200);
    expect(mockDb.bulkActorStatusOperation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user_1", businessProfileId: "workspace_1" }),
        take: 20,
      }),
    );
    expect((await response.json()).data).toMatchObject({ total: 1, totalPages: 1 });
  });

  it("creates a daily schedule with a per-run publication limit", async () => {
    mockDb.bulkPublishSchedule.create.mockResolvedValue({
      id: "bulk_1",
      dailyLimit: 7,
      actors: [{ actorId: "actor_1" }],
    });

    const response = await buildApp().request("/schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Daily publishing",
        actorIds: ["actor_1"],
        cronExpr: "0 2 * * *",
        dailyLimit: 7,
      }),
    });

    expect(response.status).toBe(201);
    expect(mockDb.bulkPublishSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dailyLimit: 7,
          cronExpr: "0 2 * * *",
          businessProfileId: "workspace_1",
          actors: { create: [{ actorId: "actor_1", position: 0 }] },
        }),
      }),
    );
  });

  it("rejects schedule creation when only Console credentials are connected", async () => {
    mockDb.apifyToken.findUnique.mockResolvedValueOnce({
      encryptedToken: null,
      apiTokenStatus: "NOT_CONFIGURED",
      validationError: null,
    });

    const response = await buildApp().request("/schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Console-only queue", actorIds: ["actor_1"] }),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({
      code: "apify_api_key_required",
    });
    expect(mockDb.bulkPublishSchedule.create).not.toHaveBeenCalled();
  });

  it("does not assign a next run to a schedule created in a paused state", async () => {
    mockDb.bulkPublishSchedule.create.mockResolvedValue({
      id: "bulk_1",
      dailyLimit: 7,
      actors: [{ actorId: "actor_1" }],
    });

    const response = await buildApp().request("/schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Paused publishing",
        actorIds: ["actor_1"],
        cronExpr: "0 2 * * *",
        dailyLimit: 7,
        enabled: false,
      }),
    });

    expect(response.status).toBe(201);
    expect(mockDb.bulkPublishSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enabled: false, nextRunAt: null }),
      }),
    );
  });

  it("clears the next run when an existing schedule is paused", async () => {
    const transactionUpdate = vi.fn().mockResolvedValue({ id: "bulk_1", actors: [] });
    mockDb.bulkPublishSchedule.findFirst.mockResolvedValue({
      id: "bulk_1",
      cronExpr: "0 2 * * *",
      enabled: true,
    });
    mockDb.$transaction.mockImplementation(async (callback) =>
      callback({
        bulkPublishScheduleActor: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        bulkPublishSchedule: { update: transactionUpdate },
      }),
    );

    const response = await buildApp().request("/schedules/bulk_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });

    expect(response.status).toBe(200);
    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enabled: false, nextRunAt: null }),
      }),
    );
  });

  it("queues a manual run for a workspace-owned schedule", async () => {
    mockDb.bulkPublishSchedule.findFirst.mockResolvedValue({ id: "bulk_1" });

    const response = await buildApp().request("/schedules/bulk_1/run", { method: "POST" });

    expect(response.status).toBe(200);
    expect(mockAssertPlanFeature).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "PRO" }),
      "publishing",
    );
    expect(mockEnqueue).toHaveBeenCalledWith("schedules", {
      bulkPublishScheduleId: "bulk_1",
      force: true,
    });
  });

  it("rejects another manual run while the same schedule is active", async () => {
    mockDb.bulkPublishSchedule.findFirst.mockResolvedValue({ id: "bulk_1" });
    mockDb.bulkPublishScheduleRun.findFirst.mockResolvedValue({ id: "run_1" });

    const response = await buildApp().request("/schedules/bulk_1/run", { method: "POST" });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({
      code: "schedule_already_running",
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("requeues a blocked Actor only inside a workspace-owned schedule", async () => {
    mockDb.bulkPublishSchedule.findFirst.mockResolvedValue({ id: "bulk_1" });

    const response = await buildApp().request("/schedules/bulk_1/actors/actor_1/retry", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mockDb.bulkPublishScheduleActor.updateMany).toHaveBeenCalledWith({
      where: {
        scheduleId: "bulk_1",
        actorId: "actor_1",
        status: { in: ["BLOCKED", "FAILED"] },
      },
      data: { status: "PENDING", lastError: null },
    });
    expect(mockDb.bulkPublishSchedule.update).toHaveBeenCalledWith({
      where: { id: "bulk_1" },
      data: { quotaBlockedUntil: null },
    });
  });

  it("returns publishing job progress for a workspace-owned schedule", async () => {
    mockDb.bulkPublishSchedule.findFirst.mockResolvedValue({ id: "bulk_1" });
    mockEnqueue.mockReset();
    const getState = vi.fn().mockResolvedValue("active");
    mockGetQueuedJob.mockResolvedValue({
      id: "job_1",
      data: { bulkPublishScheduleId: "bulk_1" },
      progress: { completed: 2, total: 5 },
      returnvalue: null,
      failedReason: null,
      getState,
    } as never);

    const response = await buildApp().request("/operations/job_1");

    expect(response.status).toBe(200);
    expect(mockDb.bulkPublishSchedule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "bulk_1",
          userId: "user_1",
          businessProfileId: "workspace_1",
        }),
      }),
    );
    expect((await response.json()).data).toMatchObject({
      state: "active",
      progress: { completed: 2, total: 5 },
    });
  });
  it("reuses the same durable operation after a timed-out enqueue and client retry", async () => {
    mockEnqueue.mockRejectedValueOnce(new Error("Redis command timed out"));
    const submit = () => buildApp().request("/actors/status", { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": "retry-fixture-key" }, body: JSON.stringify({ actorIds: ["actor_1"], isDeprecated: true }) });
    const first = await submit();
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({ data: { dispatchPending: true, jobId: "actor-status-operation_1" } });
    const data = mockDb.bulkActorStatusOperation.create.mock.calls[0][0].data;
    expect(data.idempotencyKey).not.toBe("retry-fixture-key");
    mockDb.bulkActorStatusOperation.findFirst.mockResolvedValue({ id: "operation_1", status: "QUEUED", requestHash: data.requestHash });
    expect((await submit()).status).toBe(202);
    expect(mockDb.bulkActorStatusOperation.create).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenLastCalledWith("schedules", expect.anything(), { jobId: "actor-status-operation_1" });
  });
  it("rejects an idempotency key reused for different operation input", async () => {
    mockDb.bulkActorStatusOperation.findFirst.mockResolvedValue({ id: "operation_1", status: "QUEUED", requestHash: "another-input" });
    const response = await buildApp().request("/actors/status", { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": "retry-fixture-key" }, body: JSON.stringify({ actorIds: ["actor_1"], isDeprecated: true }) });
    expect(response.status).toBe(409);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockDb.bulkActorStatusOperation.create).not.toHaveBeenCalled();
  });

});
