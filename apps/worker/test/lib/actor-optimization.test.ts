import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    actorOptimizationResult: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    actorOptimizationRun: { update: vi.fn(), updateMany: vi.fn() },
    actor: { update: vi.fn() },
    pricingHistory: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  apify: { getActor: vi.fn(), getActorBasicInfo: vi.fn(), updateActorMetadata: vi.fn(), appendActorPricing: vi.fn() },
  audit: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({ db: mocks.db, Prisma: { JsonNull: null } }));
vi.mock("@actorconsole/apify", () => ({ getUserApifyClient: vi.fn(async () => mocks.apify) }));
vi.mock("@actorconsole/ai", () => ({ auditActorListing: mocks.audit, AiProviderUnavailableError: class extends Error {} }));
vi.mock("../../src/lib/plan-access.js", () => ({ assertWorkspacePlanAccess: mocks.access }));

import { runOptimizationApply, runOptimizationAudit } from "../../src/lib/actor-optimization.js";

describe("Actor optimization generation and application", () => {
  let result: Record<string, any>;
  let live: Record<string, any>;
  let run: Record<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    live = { name: "example", title: "Original listing", description: "Original description", readme: "# Usage", categories: ["OTHER"], pictureUrl: null };
    run = { id: "run", userId: "owner", businessProfileId: "workspace", kind: "REWRITE_COPY", requestedFields: ["title", "description"], totalCount: 1, completedCount: 0, failedCount: 0, appliedCount: 0 };
    result = { id: "result", actorId: "actor", runId: "run", status: "QUEUED", actor: { apifyActorId: "provider_actor" }, run };
    mocks.db.actorOptimizationResult.findUnique.mockImplementation(async () => ({ ...result }));
    mocks.db.actorOptimizationResult.update.mockImplementation(async ({ data }) => Object.assign(result, data));
    mocks.db.actorOptimizationRun.update.mockImplementation(async ({ data }) => {
      for (const [field, value] of Object.entries(data)) {
        run[field] = typeof value === "object" && value !== null && "increment" in value
          ? run[field] + value.increment : value;
      }
      return { ...run };
    });
    mocks.db.actorOptimizationResult.count.mockImplementation(async ({ where }) =>
      result.approvedAt && (!where.status || where.status.in.includes(result.status)) ? 1 : 0,
    );
    mocks.db.$transaction.mockImplementation(async (operations) => Promise.all(operations));
    mocks.apify.getActor.mockImplementation(async () => ({ ...live }));
    mocks.apify.getActorBasicInfo.mockResolvedValue({});
    mocks.apify.updateActorMetadata.mockResolvedValue({});
    mocks.apify.appendActorPricing.mockResolvedValue({ changed: true });
    mocks.audit.mockResolvedValue({ proposal: { title: "Proposed listing", description: "Proposed description", pricing: null }, issues: [], summary: "Clearer copy" });
  });

  it.each([null, "https://example.test/logo.png"])("applies only approved fields from an unchanged generated proposal (image %s)", async (pictureUrl) => {
    live.pictureUrl = pictureUrl;
    await runOptimizationAudit("result");
    expect(result.status).toBe("READY_FOR_APPROVAL");
    expect(run.completedCount).toBe(1);
    expect(mocks.apify.updateActorMetadata).not.toHaveBeenCalled();

    result.status = "APPROVED";
    result.approvedFields = ["title"];
    result.approvedAt = new Date();
    await runOptimizationApply("result");

    expect(result.status).toBe("APPLIED");
    expect(run.status).toBe("APPLIED");
    expect(run.appliedCount).toBe(1);
    expect(mocks.apify.updateActorMetadata).toHaveBeenCalledTimes(1);
    expect(mocks.apify.updateActorMetadata).toHaveBeenCalledWith("provider_actor", { title: "Proposed listing" });
    expect(mocks.apify.appendActorPricing).not.toHaveBeenCalled();
    expect(mocks.db.actor.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: "Proposed listing" }) }));
    expect(mocks.db.actor.update.mock.calls[0][0].data.description).toBeUndefined();
    expect(mocks.access).toHaveBeenCalledWith("owner", "workspace");
  });

  it("marks a changed proposal stale before any provider or Actor mutation", async () => {
    await runOptimizationAudit("result");
    result.status = "APPROVED";
    result.approvedFields = ["title"];
    result.approvedAt = new Date();
    live.title = "Changed outside ActorConsole";

    await runOptimizationApply("result");

    expect(result.status).toBe("STALE");
    expect(run.status).toBe("PARTIALLY_APPLIED");
    expect(run.appliedCount).toBe(0);
    expect(mocks.apify.updateActorMetadata).not.toHaveBeenCalled();
    expect(mocks.apify.appendActorPricing).not.toHaveBeenCalled();
    expect(mocks.db.actor.update).not.toHaveBeenCalled();
  });

  it("rejects unapproved application and does not double-count an already applied job", async () => {
    await expect(runOptimizationApply("result")).rejects.toThrow("has not been approved");
    result.status = "APPLIED";
    await runOptimizationApply("result");
    expect(mocks.apify.getActor).not.toHaveBeenCalled();
    expect(mocks.db.actorOptimizationRun.update).not.toHaveBeenCalled();
  });
});
