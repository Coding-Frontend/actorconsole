import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../src/app.js";
import { onErrorHandler } from "../../src/middleware/error.js";

const mocks = vi.hoisted(() => ({
  actors: vi.fn(),
  costs: vi.fn(),
  count: vi.fn(),
  aggregate: vi.fn(),
  groupBy: vi.fn(),
  findActor: vi.fn(),
  createCost: vi.fn(),
}));
vi.mock("@actorconsole/db", async () => {
  const { Prisma } = await import("@prisma/client");
  return {
    Prisma,
    db: {
      actor: { findMany: mocks.actors, findFirst: mocks.findActor },
      actorExternalCost: {
        findMany: mocks.costs,
        count: mocks.count,
        aggregate: mocks.aggregate,
        groupBy: mocks.groupBy,
        create: mocks.createCost,
      },
    },
  };
});
vi.mock("../../src/middleware/auth.js", () => ({
  requireInteractiveSession: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../../src/lib/rate-limit.js", () => ({ checkRateLimit: vi.fn() }));
import { intelligenceRoutes } from "../../src/routes/intelligence.js";

const app = new Hono<AppEnv>();
app.onError(onErrorHandler);
app.use("*", async (c, next) => {
  c.set("session", {
    userId: "u1",
    email: "test@example.com",
    plan: "PRO",
    businessProfileId: "workspace-1",
  });
  await next();
});
app.route("/intelligence", intelligenceRoutes);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actors.mockResolvedValue([]);
  mocks.costs.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
  mocks.aggregate.mockResolvedValue({ _sum: { amountUsd: null } });
  mocks.groupBy.mockResolvedValue([]);
  mocks.findActor.mockResolvedValue({ id: "actor-1" });
});

describe("workspace financial reports", () => {
  it("returns covered-day profit with workspace, actor and UTC boundaries applied", async () => {
    mocks.actors.mockResolvedValue([
      {
        id: "actor-1",
        title: "Actor",
        actorName: "actor",
        insightSnapshots: [
          { capturedOn: new Date("2026-09-01"), revenueUsd: 10, costUsd: 4, monetization: null },
        ],
        externalCosts: [{ incurredAt: new Date("2026-09-01T23:59:59Z"), amountUsd: "3" }],
      },
    ]);
    const response = await app.request(
      "/intelligence/profitability?from=2026-09-01&to=2026-09-02&actor=actor-1",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).data.items[0]).toMatchObject({
      profitUsd: 3,
      margin: 30,
      matchedDays: 1,
      complete: false,
    });
    expect(mocks.actors.mock.calls[0][0]).toMatchObject({
      where: { businessProfileId: "workspace-1", id: "actor-1" },
      select: {
        insightSnapshots: {
          where: {
            capturedOn: {
              gte: new Date("2026-09-01"),
              lt: new Date("2026-09-03"),
            },
          },
        },
        externalCosts: { select: { amountUsd: true, incurredAt: true } },
      },
    });
  });
  it.each(["costs", "profitability"])(
    "rejects impossible calendar dates before querying %s",
    async (endpoint) => {
      const response = await app.request(`/intelligence/${endpoint}?from=2026-02-30&to=2026-03-01`);
      expect(response.status).toBe(400);
      expect(mocks.actors).not.toHaveBeenCalled();
      expect(mocks.costs).not.toHaveBeenCalled();
    },
  );
  it("clamps stale ledger pages and applies the same UTC and workspace scope to totals", async () => {
    mocks.count.mockResolvedValue(51);
    mocks.aggregate.mockResolvedValue({ _sum: { amountUsd: "0.000001" } });
    const response = await app.request(
      "/intelligence/costs?from=2026-09-01&to=2026-09-02&actor=actor-1&page=999",
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ page: 2, total: 51, totalUsd: 0.000001 });
    const where = {
      actor: { businessProfileId: "workspace-1" },
      actorId: "actor-1",
      incurredAt: { gte: new Date("2026-09-01"), lt: new Date("2026-09-03") },
    };
    expect(mocks.costs).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 50,
        orderBy: [{ incurredAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(mocks.count).toHaveBeenCalledWith({ where });
    expect(mocks.aggregate).toHaveBeenCalledWith({ where, _sum: { amountUsd: true } });
  });
  it("rejects expenses that would round down to zero in storage", async () => {
    const response = await app.request("/intelligence/actors/actor-1/costs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "AI", amountUsd: 0.0000001 }),
    });
    expect(response.status).toBe(400);
    expect(mocks.createCost).not.toHaveBeenCalled();
  });
});
