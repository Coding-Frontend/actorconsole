import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { db } from "@actorconsole/db";
import { intelligenceRoutes } from "../src/routes/intelligence";
import { onErrorHandler } from "../src/middleware/error";
import type { AppEnv } from "../src/app";
import { refreshStoreWatchAlerts } from "../../worker/src/lib/watch-alerts";

const target = process.env.ACTORCONSOLE_TEST_DATABASE_URL;
const enabled =
  !!target &&
  target === process.env.DATABASE_URL &&
  /^mysql:\/\/[^/]+@(localhost|127\.0\.0\.1):\d+\/actorconsole_intelligence_(test|preview)$/.test(
    target,
  );
describe.skipIf(!enabled)("Actor intelligence against isolated MySQL", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `intel-test-${suffix}`;
  const workspaceId = `intel-workspace-${suffix}`;
  const otherWorkspaceId = `intel-other-${suffix}`;
  let actorId: string;
  const app = new Hono<AppEnv>();
  app.onError(onErrorHandler);
  app.use("/intelligence/*", async (c, next) => {
    c.set("session", {
      userId,
      email: "isolated@example.test",
      plan: "PRO",
      businessProfileId: c.req.header("x-test-workspace") ?? workspaceId,
      ...(c.req.header("x-test-api-key") ? { authMethod: "api-key" as const } : {}),
    });
    await next();
  });
  app.route("/intelligence", intelligenceRoutes);
  const admin = (
    path: string,
    method = "GET",
    data?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.request(`/intelligence${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  beforeAll(async () => {
    await db.user.create({
      data: {
        id: userId,
        email: `${suffix}@example.test`,
        businessProfiles: {
          create: [
            { id: workspaceId, name: "Isolated test", slug: "test" },
            { id: otherWorkspaceId, name: "Other test", slug: "other" },
          ],
        },
      },
    });
    actorId = (
      await db.actor.create({
        data: {
          userId,
          businessProfileId: workspaceId,
          apifyActorId: suffix,
          actorName: "isolated-actor",
          username: "test",
        },
      })
    ).id;
  });
  afterAll(async () => {
    await db.actor.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.storeActor.deleteMany({
      where: { apifyActorId: { in: [`store-${suffix}`, suffix] } },
    });
    await db.$disconnect();
  });

  it("scopes public earnings to the interactive workspace and keeps missing catalog data unknown", async () => {
    const response = await admin("/earnings");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const data = (await response.json()).data;
    expect(data.items.map((actor: { id: string }) => actor.id)).toEqual([actorId]);
    expect(data.summary).toMatchObject({ totalActors: 1, coveredActors: 0, centralUsd: null });
    const listing = await db.storeActor.create({
      data: {
        apifyActorId: suffix,
        username: "test",
        actorName: "isolated-actor",
        isPublic: true,
        isDeprecated: false,
        runs30Days: 1000,
        users30Days: 100,
        pricingInfos: [{ pricingModel: "PRICE_PER_DATASET_ITEM", pricePerUnitUsd: 0.005 }],
      },
    });
    expect((await (await admin("/earnings")).json()).data.summary).toMatchObject({
      coveredActors: 1,
      lowUsd: 4,
      centralUsd: 120,
      highUsd: 2800,
    });
    await db.storeActor.update({ where: { id: listing.id }, data: { isPublic: false } });
    expect((await (await admin("/earnings")).json()).data.summary.centralUsd).toBeNull();
    const other = await admin("/earnings", "GET", undefined, {
      "x-test-workspace": otherWorkspaceId,
    });
    expect((await other.json()).data.items).toEqual([]);
    expect((await admin("/earnings", "GET", undefined, { "x-test-api-key": "1" })).status).toBe(
      403,
    );
  });
  it("preserves fractional expenses, scopes reports, and calculates matched-day profit", async () => {
    expect(
      (
        await admin(
          `/actors/${actorId}/costs`,
          "POST",
          { source: "AI", amountUsd: 0.000001 },
          {
            "x-test-workspace": otherWorkspaceId,
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await admin(
          `/actors/${actorId}/costs`,
          "POST",
          { source: "AI", amountUsd: 0.000001 },
          {
            "x-test-api-key": "1",
          },
        )
      ).status,
    ).toBe(403);
    const expense = await admin(`/actors/${actorId}/costs`, "POST", {
      eventId: "micro-cost",
      source: "AI",
      amountUsd: 0.000001,
      incurredAt: "2026-10-04T00:00:00.000Z",
    });
    expect(expense.status).toBe(201);
    expect(Number((await expense.json()).data.amountUsd)).toBe(0.000001);
    const dates = ["2026-09-01", "2026-09-02"];
    for (const date of dates)
      await db.actorInsightSnapshot.create({
        data: {
          actorId,
          capturedOn: new Date(date),
          periodStart: new Date("2026-09-01"),
          revenueUsd: 10,
          ...(date.endsWith("01") ? { costUsd: 4 } : {}),
        },
      });
    await admin(`/actors/${actorId}/costs`, "POST", {
      source: "Proxy",
      amountUsd: 3,
      incurredAt: "2026-09-01T00:00:00.000Z",
    });
    const path = "/profitability?from=2026-09-01&to=2026-09-02";
    expect((await (await admin(path)).json()).data.items[0]).toMatchObject({
      revenueUsd: 20,
      costDays: 1,
      profitUsd: 3,
      margin: 30,
      matchedDays: 1,
      complete: false,
    });
    await db.actorInsightSnapshot.update({
      where: { actorId_capturedOn: { actorId, capturedOn: new Date(dates[1]!) } },
      data: { costUsd: 4 },
    });
    expect((await (await admin(path)).json()).data.items[0]).toMatchObject({
      profitUsd: 9,
      margin: 45,
    });
    expect(
      (
        await (
          await admin("/costs", "GET", undefined, { "x-test-workspace": otherWorkspaceId })
        ).json()
      ).data.items,
    ).toEqual([]);
    expect((await admin("/profitability?from=invalid")).status).toBe(400);
  });
  it("persists workspace watches and emits one notification for a detail-only change", async () => {
    const store = await db.storeActor.create({
      data: {
        apifyActorId: `store-${suffix}`,
        username: "isolated-test",
        actorName: suffix,
        title: "Test watch",
        users30Days: 100,
        runs30Days: 100,
        pricingInfos: [{ pricingModel: "PAY_PER_EVENT", pricePerUnitUsd: 1 }],
        lastSeenAt: new Date(),
      },
    });
    const watch = (await (await admin("/watches", "POST", { storeActorId: store.id })).json()).data;
    expect(
      (
        await (
          await admin("/watches", "GET", undefined, { "x-test-workspace": otherWorkspaceId })
        ).json()
      ).data,
    ).toEqual([]);
    await db.storeActor.update({
      where: { id: store.id },
      data: {
        users30Days: 150,
        detailsSyncedAt: new Date(Date.now() + 1000),
        pricingInfos: [{ pricingModel: "PAY_PER_EVENT", pricePerUnitUsd: 2 }],
      },
    });
    await refreshStoreWatchAlerts();
    await refreshStoreWatchAlerts();
    const notifications = await db.notification.findMany({
      where: { userId, type: "store-watch" },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.body).toContain("Published pricing changed");
    expect(
      (
        await admin(
          `/watches/${watch.id}`,
          "PATCH",
          { alertsEnabled: false },
          { "x-test-workspace": otherWorkspaceId },
        )
      ).status,
    ).toBe(404);
    await db.notificationPreference.create({
      data: { userId, businessProfileId: workspaceId, product: false },
    });
    await db.storeActor.update({
      where: { id: store.id },
      data: { users30Days: 200, detailsSyncedAt: new Date(Date.now() + 3000) },
    });
    await refreshStoreWatchAlerts();
    expect(await db.notification.count({ where: { userId, type: "store-watch" } })).toBe(1);
  });
});
