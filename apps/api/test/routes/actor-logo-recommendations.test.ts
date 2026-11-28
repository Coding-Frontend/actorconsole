import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const { db, enqueue, getUserApifyClient, readWebsiteLogo, recordUserAudit, updateActorMetadata } =
  vi.hoisted(() => ({
    db: {
      actorLogoRecommendation: {
        findMany: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      actorLogoApplyBatch: {
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findFirst: vi.fn(),
      },
      actor: { update: vi.fn() },
      $transaction: vi.fn(),
    },
    enqueue: vi.fn(),
    getUserApifyClient: vi.fn(),
    readWebsiteLogo: vi.fn(),
    recordUserAudit: vi.fn(),
    updateActorMetadata: vi.fn(),
  }));

// Run the real shared apply logic against the mocked database.
vi.mock("../../../../packages/db/src/client.js", () => ({ db }));
vi.mock("@actorconsole/db", async () => ({
  ...(await import("../../../../packages/db/src/actor-logo-recommendations.js")),
  db,
}));
vi.mock("@actorconsole/apify", () => ({
  getUserApifyClient: (...args: unknown[]) => getUserApifyClient(...args),
}));
vi.mock("@actorconsole/logo-catalog", () => ({
  readWebsiteLogo: (...args: unknown[]) => readWebsiteLogo(...args),
}));
vi.mock("../../src/lib/user-audit.js", () => ({
  recordUserAudit: (...args: unknown[]) => recordUserAudit(...args),
}));
vi.mock("../../src/lib/queue.js", () => ({
  enqueue: (...args: unknown[]) => enqueue(...args),
}));

import { actorLogoRecommendationRoutes } from "../../src/routes/actor-logo-recommendations.js";
import {
  requireActorApiKeyCapability,
  requireApiKeyMethodScope,
} from "../../src/middleware/api-key-scope.js";

function app(actorIds?: string[], scopes = ["actors:read", "actors:write"]) {
  const instance = new Hono();
  instance.onError(onErrorHandler);
  instance.use("*", async (c: any, next) => {
    c.set("session", {
      userId: "user_1",
      email: "owner@example.com",
      plan: "PRO",
      businessProfileId: "workspace_1",
      ...(actorIds
        ? { authMethod: "api-key", apiKeyActorIds: actorIds, apiKeyScopes: scopes }
        : {}),
    });
    await next();
  });
  instance.use("/actors/*", requireApiKeyMethodScope({ allowGranularMcp: true }));
  instance.use("/actors/*", requireActorApiKeyCapability());
  instance.route("/actors", actorLogoRecommendationRoutes);
  return instance;
}

const recommendation = {
  id: "recommendation_1",
  actorId: "actor_1",
  logoId: "logo_1",
  status: "PENDING",
  actor: {
    id: "actor_1",
    apifyActorId: "apify_actor_1",
    title: "Google Maps Scraper",
    actorName: "google-maps-scraper",
    currentImageUrl: null,
    websiteIdentityId: "website_1",
    websiteIdentity: { status: "ACTIVE", currentLogoId: "logo_1" },
  },
  logo: {
    id: "logo_1",
    websiteIdentityId: "website_1",
    reviewStatus: "APPROVED",
    storagePath:
      "website-logos/google-maps/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp",
    checksum: "a".repeat(64),
    contentType: "image/webp",
    websiteIdentity: { id: "website_1", name: "Google Maps", canonicalDomain: "maps.google.com" },
  },
};

const apply = (actorIds?: string[]) =>
  app(actorIds).request("/actors/logo-recommendations/recommendation_1/apply", { method: "POST" });

/** The conditional update that hands a claimed row back (or marks it superseded). */
function releaseCall() {
  return db.actorLogoRecommendation.updateMany.mock.calls.find(
    ([options]) => options.where.status === "APPLYING",
  )?.[0];
}

describe("Actor logo recommendation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.actorLogoRecommendation.findMany.mockResolvedValue([recommendation]);
    db.actorLogoRecommendation.count.mockResolvedValue(1);
    db.actorLogoRecommendation.groupBy.mockResolvedValue([{ status: "PENDING", _count: 1 }]);
    db.actorLogoRecommendation.findFirst.mockResolvedValue(recommendation);
    db.actorLogoRecommendation.findUniqueOrThrow.mockResolvedValue(recommendation);
    db.actorLogoRecommendation.update.mockResolvedValue(recommendation);
    db.actorLogoRecommendation.updateMany.mockResolvedValue({ count: 1 });
    db.actor.update.mockResolvedValue({ id: "actor_1" });
    db.$transaction.mockImplementation(async (operations: unknown) =>
      typeof operations === "function"
        ? (operations as (tx: typeof db) => Promise<unknown>)(db)
        : Promise.all(operations as Array<Promise<unknown>>),
    );
    recordUserAudit.mockResolvedValue(undefined);
    enqueue.mockResolvedValue("job_1");
  });

  it("lists only scoped pending recommendations with immutable asset URLs", async () => {
    const response = await app().request("/actors/logo-recommendations");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items[0].proposedImageUrl).toBe("/api/website-logo-assets/logo_1");
    expect(db.actorLogoRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          actor: expect.objectContaining({ userId: "user_1", businessProfileId: "workspace_1" }),
        }),
      }),
    );
  });

  it("returns scoped status totals and deduplicated website filters for the bulk review page", async () => {
    db.actorLogoRecommendation.groupBy.mockResolvedValue([
      { status: "PENDING", _count: 33 },
      { status: "APPLIED", _count: 12 },
      { status: "DISMISSED", _count: 4 },
    ]);
    db.actorLogoRecommendation.findMany
      .mockResolvedValueOnce([recommendation])
      .mockResolvedValueOnce([{ logo: recommendation.logo }, { logo: recommendation.logo }]);
    const response = await app(["apify_actor_1"]).request(
      "/actors/logo-recommendations?summary=true&q=maps&websiteId=website_1&thumbnail=missing",
    );
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.workspaceId).toBe("workspace_1");
    expect(data.summary.counts).toEqual({ PENDING: 33, APPLIED: 12, DISMISSED: 4 });
    expect(data.summary.websites).toEqual([recommendation.logo.websiteIdentity]);
    expect(db.actorLogoRecommendation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actor: expect.objectContaining({
            userId: "user_1",
            businessProfileId: "workspace_1",
            apifyActorId: { in: ["apify_actor_1"] },
            OR: [{ currentImageUrl: null }, { currentImageUrl: "" }],
          }),
          logo: { websiteIdentityId: "website_1" },
        }),
      }),
    );
    const options = db.actorLogoRecommendation.findMany.mock.calls[1]![0];
    expect(options.where.actor).toMatchObject({
      userId: "user_1",
      businessProfileId: "workspace_1",
      apifyActorId: { in: ["apify_actor_1"] },
    });
    expect(options.where.OR).toBeUndefined();
    expect(options.where.logo).toBeUndefined();
  });

  it("enumerates only scoped pending IDs using a stable selection cursor", async () => {
    const response = await app(["apify_actor_1"]).request(
      "/actors/logo-recommendations/selection?after=before&limit=1&websiteId=website_1",
    );
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.workspaceId).toBe("workspace_1");
    expect(data.nextCursor).toBe("recommendation_1");
    expect(db.actorLogoRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { gt: "before" },
          status: "PENDING",
          logo: { websiteIdentityId: "website_1" },
          actor: expect.objectContaining({
            userId: "user_1",
            businessProfileId: "workspace_1",
            apifyActorId: { in: ["apify_actor_1"] },
          }),
        }),
        orderBy: { id: "asc" },
        take: 1,
        select: { id: true, actor: { select: { id: true, actorName: true, title: true } } },
      }),
    );
    expect(getUserApifyClient).not.toHaveBeenCalled();
  });

  it("filters Actors with existing thumbnails separately from missing thumbnails", async () => {
    await app().request("/actors/logo-recommendations?thumbnail=existing&status=APPLIED");
    expect(db.actorLogoRecommendation.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: "APPLIED",
        actor: expect.objectContaining({
          currentImageUrl: { not: null },
          NOT: { currentImageUrl: "" },
        }),
      }),
    });
  });

  it.each(["status=unknown", "thumbnail=unknown", "summary=yes", "q=", "websiteId="])(
    "validates bulk review query %s",
    async (query) => {
      const response = await app().request(`/actors/logo-recommendations?${query}`);
      expect(response.status).toBe(400);
      expect(db.actorLogoRecommendation.findMany).not.toHaveBeenCalled();
    },
  );

  it("rejects selecting a completed history tab", async () => {
    const response = await app().request("/actors/logo-recommendations/selection?status=APPLIED");
    expect(response.status).toBe(400);
    expect(db.actorLogoRecommendation.findMany).not.toHaveBeenCalled();
  });

  it("claims the recommendation with a conditional update before doing anything else", async () => {
    getUserApifyClient.mockResolvedValue({ updateActorMetadata });
    readWebsiteLogo.mockResolvedValue(Buffer.from("logo"));
    updateActorMetadata.mockResolvedValue({ pictureUrl: "https://api.apify.com/logo.webp", verified: true });
    await apply();
    expect(db.actorLogoRecommendation.updateMany.mock.calls[0]![0]).toMatchObject({
      where: {
        id: "recommendation_1",
        OR: [{ status: "PENDING" }, { status: "APPLYING", updatedAt: { lt: expect.any(Date) } }],
      },
      data: { status: "APPLYING", error: null },
    });
  });

  it("does not upload twice when another request already claimed the logo", async () => {
    db.actorLogoRecommendation.updateMany.mockResolvedValueOnce({ count: 0 });
    db.actorLogoRecommendation.findFirst
      .mockResolvedValueOnce(recommendation)
      .mockResolvedValueOnce({ status: "APPLYING" });
    const response = await apply();
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("logo_recommendation_in_progress");
    expect(getUserApifyClient).not.toHaveBeenCalled();
    expect(updateActorMetadata).not.toHaveBeenCalled();
  });

  it("keeps a recommendation pending when publishing credentials are unavailable", async () => {
    getUserApifyClient.mockResolvedValue(null);
    const response = await apply();
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("apify_publishing_credentials_required");
    expect(releaseCall()).toEqual({
      where: { id: "recommendation_1", status: "APPLYING" },
      data: { status: "PENDING", error: expect.stringContaining("unavailable") },
    });
  });

  it("uploads the approved logo through Apify and records it as applied", async () => {
    getUserApifyClient.mockResolvedValue({ updateActorMetadata });
    readWebsiteLogo.mockResolvedValue(Buffer.from("logo"));
    updateActorMetadata.mockResolvedValue({
      pictureUrl: "https://api.apify.com/logo.webp",
      verified: true,
    });
    const response = await apply();
    expect(response.status).toBe(200);
    expect(updateActorMetadata).toHaveBeenCalledWith(
      "apify_actor_1",
      expect.objectContaining({
        picture: expect.objectContaining({ contentType: "image/webp", fileName: "aaaaaaaaaaaaaaaa.webp" }),
      }),
    );
    expect(db.actor.update).toHaveBeenCalledWith({
      where: { id: "actor_1" },
      data: { currentImageUrl: "https://api.apify.com/logo.webp" },
    });
    expect(db.actorLogoRecommendation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPLIED" }) }),
    );
    expect(recordUserAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "actor.logo.applied",
      "actor:actor_1",
      expect.objectContaining({ logoId: "logo_1" }),
    );
  });

  it("reports success when only the audit entry fails after Apify accepted the logo", async () => {
    getUserApifyClient.mockResolvedValue({ updateActorMetadata });
    readWebsiteLogo.mockResolvedValue(Buffer.from("logo"));
    updateActorMetadata.mockResolvedValue({ pictureUrl: "https://api.apify.com/logo.webp", verified: true });
    recordUserAudit.mockRejectedValue(new Error("audit table unavailable"));
    const response = await apply();
    expect(response.status).toBe(200);
    expect((await response.json()).data.pictureUrl).toBe("https://api.apify.com/logo.webp");
    expect(releaseCall()).toBeUndefined();
  });

  it.each([
    [403, "Insufficient permissions"],
    [429, "Too Many Requests"],
  ])("keeps the recommendation pending after an Apify %s response", async (_status, message) => {
    getUserApifyClient.mockResolvedValue({ updateActorMetadata });
    readWebsiteLogo.mockResolvedValue(Buffer.from("logo"));
    updateActorMetadata.mockRejectedValue(new Error(message));
    const response = await apply();
    expect(response.status).toBe(502);
    expect(releaseCall()).toEqual({
      where: { id: "recommendation_1", status: "APPLYING" },
      data: { status: "PENDING", error: message },
    });
    expect(db.actor.update).not.toHaveBeenCalled();
  });

  it("dismisses a recommendation without modifying Apify", async () => {
    const response = await app().request("/actors/logo-recommendations/recommendation_1/dismiss", {
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(db.actorLogoRecommendation.updateMany).toHaveBeenCalledWith({
      where: { id: "recommendation_1", status: "PENDING" },
      data: expect.objectContaining({ status: "DISMISSED" }),
    });
    expect(getUserApifyClient).not.toHaveBeenCalled();
  });

  it("dismisses many recommendations in one scoped, conditional update", async () => {
    db.actorLogoRecommendation.findMany
      .mockResolvedValueOnce([{ id: "recommendation_1" }, { id: "recommendation_2" }])
      .mockResolvedValueOnce([{ id: "recommendation_1" }]);
    const response = await app().request("/actors/logo-recommendations/dismiss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["recommendation_1", "recommendation_2", "recommendation_3"] }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.dismissed).toEqual(["recommendation_1"]);
    expect(db.actorLogoRecommendation.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: "PENDING",
        id: { in: ["recommendation_1", "recommendation_2"] },
        actor: expect.objectContaining({ userId: "user_1", businessProfileId: "workspace_1" }),
      }),
      data: expect.objectContaining({ status: "DISMISSED" }),
    });
    expect(getUserApifyClient).not.toHaveBeenCalled();
  });

  it.each([
    { websiteIdentityId: "other_website" },
    { websiteIdentity: { status: "ACTIVE", currentLogoId: "new_logo" } },
    { websiteIdentity: { status: "ARCHIVED", currentLogoId: "logo_1" } },
  ])("rejects a stale recommendation before uploading: %j", async (actorChange) => {
    db.actorLogoRecommendation.findUniqueOrThrow.mockResolvedValue({
      ...recommendation,
      actor: { ...recommendation.actor, ...actorChange },
    });
    const response = await apply();
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("logo_recommendation_superseded");
    expect(releaseCall()?.data).toEqual({ status: "SUPERSEDED", error: null });
    expect(readWebsiteLogo).not.toHaveBeenCalled();
    expect(getUserApifyClient).not.toHaveBeenCalled();
  });

  it("does not apply a logo that is awaiting review", async () => {
    db.actorLogoRecommendation.findUniqueOrThrow.mockResolvedValue({
      ...recommendation,
      logo: { ...recommendation.logo, reviewStatus: "PENDING" },
    });
    const response = await apply();
    expect(response.status).toBe(409);
    expect(updateActorMetadata).not.toHaveBeenCalled();
  });

  it.each([
    { pictureUrl: "https://api.apify.com/logo.webp", verified: false },
    { pictureUrl: null, verified: true },
  ])("does not record an unverified thumbnail as applied: %j", async (result) => {
    getUserApifyClient.mockResolvedValue({ updateActorMetadata });
    readWebsiteLogo.mockResolvedValue(Buffer.from("logo"));
    updateActorMetadata.mockResolvedValue(result);
    const response = await apply();
    expect(response.status).toBe(502);
    expect(db.actor.update).not.toHaveBeenCalled();
    expect(releaseCall()).toEqual({
      where: { id: recommendation.id, status: "APPLYING" },
      data: { status: "PENDING", error: expect.stringContaining("did not verify") },
    });
  });

  it("filters both recommendation rows and count to the credential's selected Actors", async () => {
    db.actorLogoRecommendation.findMany.mockImplementation(async ({ where }) =>
      where.actor.apifyActorId?.in.includes("apify_actor_1") ? [recommendation] : [],
    );
    db.actorLogoRecommendation.count.mockImplementation(async ({ where }) =>
      where.actor.apifyActorId?.in.includes("apify_actor_1") ? 1 : 0,
    );
    const response = await app(["other_actor"]).request("/actors/logo-recommendations");

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ items: [], total: 0 });
    const where = {
      status: "PENDING",
      actor: {
        userId: "user_1",
        businessProfileId: "workspace_1",
        apifyRemovedAt: null,
        apifyActorId: { in: ["other_actor"] },
      },
    };
    expect(db.actorLogoRecommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(db.actorLogoRecommendation.count).toHaveBeenCalledWith({ where });
  });

  it.each(["apply", "dismiss"])(
    "denies %s outside the selected Actors before any side effect",
    async (action) => {
      const response = await app(["other_actor"]).request(
        `/actors/logo-recommendations/recommendation_1/${action}`,
        { method: "POST" },
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("api_key_actor_denied");
      expect(getUserApifyClient).not.toHaveBeenCalled();
      expect(readWebsiteLogo).not.toHaveBeenCalled();
      expect(updateActorMetadata).not.toHaveBeenCalled();
      expect(db.actor.update).not.toHaveBeenCalled();
      expect(db.actorLogoRecommendation.update).not.toHaveBeenCalled();
      expect(db.actorLogoRecommendation.updateMany).not.toHaveBeenCalled();
    },
  );

  it("allows an included Actor while retaining the mutation capability check", async () => {
    const permitted = await app(["apify_actor_1"]).request(
      "/actors/logo-recommendations/recommendation_1/dismiss",
      { method: "POST" },
    );
    expect(permitted.status).toBe(200);
    db.actorLogoRecommendation.updateMany.mockClear();
    const denied = await app(["apify_actor_1"], ["actors:read"]).request(
      "/actors/logo-recommendations/recommendation_1/dismiss",
      { method: "POST" },
    );
    expect(denied.status).toBe(403);
    expect(db.actorLogoRecommendation.updateMany).not.toHaveBeenCalled();
  });

  describe("background bulk apply", () => {
    const batch = {
      id: "batch_1",
      userId: "user_1",
      businessProfileId: "workspace_1",
      status: "QUEUED",
      total: 2,
      jobId: "logo-apply-batch_1",
      stopRequested: false,
      error: null,
      createdAt: new Date("2026-11-28T00:00:00Z"),
      completedAt: null,
    };

    beforeEach(() => {
      getUserApifyClient.mockResolvedValue({ updateActorMetadata });
      db.actorLogoApplyBatch.create.mockResolvedValue({ ...batch, total: 0, jobId: null });
      db.actorLogoApplyBatch.update.mockImplementation(async ({ data }) => ({ ...batch, ...data }));
      db.actorLogoApplyBatch.findFirst.mockResolvedValue(batch);
      db.actorLogoRecommendation.updateMany.mockResolvedValue({ count: 2 });
      db.actorLogoRecommendation.findMany.mockResolvedValue([
        { id: "recommendation_1", status: "APPLIED", error: null, actor: recommendation.actor },
        { id: "recommendation_2", status: "PENDING", error: "Too Many Requests", actor: recommendation.actor },
      ]);
    });

    const start = (ids = ["recommendation_1", "recommendation_2"]) =>
      app().request("/actors/logo-recommendations/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });

    it("queues only scoped pending recommendations and hands them to the worker", async () => {
      const response = await start();
      expect(response.status).toBe(202);
      expect(db.actorLogoRecommendation.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: { in: ["recommendation_1", "recommendation_2"] },
          status: "PENDING",
          actor: expect.objectContaining({ userId: "user_1", businessProfileId: "workspace_1" }),
        }),
        data: { status: "QUEUED", batchId: "batch_1", error: null },
      });
      expect(enqueue).toHaveBeenCalledWith(
        "schedules",
        { logoApplyBatch: { batchId: "batch_1", userId: "user_1", businessProfileId: "workspace_1" } },
        { jobId: "logo-apply-batch_1" },
      );
      expect(updateActorMetadata).not.toHaveBeenCalled();
      const data = (await response.json()).data;
      expect(data.items).toEqual([
        expect.objectContaining({ id: "recommendation_1", outcome: "applied", retryable: false }),
        expect.objectContaining({
          id: "recommendation_2",
          outcome: "failed",
          message: "Too Many Requests",
          retryable: true,
        }),
      ]);
    });

    it("still accepts the batch when the queue is briefly unavailable", async () => {
      enqueue.mockRejectedValue(new Error("Queue command timed out"));
      const response = await start();
      expect(response.status).toBe(202);
    });

    it("refuses to start without publishing credentials", async () => {
      getUserApifyClient.mockResolvedValue(null);
      const response = await start();
      expect(response.status).toBe(409);
      expect(db.actorLogoApplyBatch.create).not.toHaveBeenCalled();
    });

    it("reports when none of the selected logos can be queued", async () => {
      db.actorLogoRecommendation.updateMany.mockResolvedValue({ count: 0 });
      const response = await start();
      expect(response.status).toBe(409);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it("stops a batch by releasing rows that have not started", async () => {
      db.actorLogoApplyBatch.findFirst.mockResolvedValue({ ...batch, status: "RUNNING" });
      const response = await app().request("/actors/logo-recommendations/batches/batch_1/stop", {
        method: "POST",
      });
      expect(response.status).toBe(200);
      expect(db.actorLogoApplyBatch.update).toHaveBeenCalledWith({
        where: { id: "batch_1" },
        data: { stopRequested: true },
      });
      expect(db.actorLogoRecommendation.updateMany).toHaveBeenCalledWith({
        where: { batchId: "batch_1", status: "QUEUED" },
        data: { status: "PENDING", batchId: null },
      });
    });

    it("only shows batches from the current workspace and user", async () => {
      db.actorLogoApplyBatch.findFirst.mockResolvedValue(null);
      const response = await app().request("/actors/logo-recommendations/batches/batch_other");
      expect(response.status).toBe(404);
      expect(db.actorLogoApplyBatch.findFirst).toHaveBeenCalledWith({
        where: { id: "batch_other", businessProfileId: "workspace_1", userId: "user_1" },
      });
    });
  });
});
