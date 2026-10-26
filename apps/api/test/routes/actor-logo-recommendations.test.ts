import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const { db, getUserApifyClient, readWebsiteLogo, recordUserAudit, updateActorMetadata } =
  vi.hoisted(() => ({
    db: {
      actorLogoRecommendation: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      actor: { update: vi.fn() },
      $transaction: vi.fn(),
    },
    getUserApifyClient: vi.fn(),
    readWebsiteLogo: vi.fn(),
    recordUserAudit: vi.fn(),
    updateActorMetadata: vi.fn(),
  }));

vi.mock("@actorconsole/db", () => ({ db }));
vi.mock("@actorconsole/apify", () => ({
  getUserApifyClient: (...args: unknown[]) => getUserApifyClient(...args),
}));
vi.mock("@actorconsole/logo-catalog", () => ({
  readWebsiteLogo: (...args: unknown[]) => readWebsiteLogo(...args),
}));
vi.mock("../../src/lib/user-audit.js", () => ({
  recordUserAudit: (...args: unknown[]) => recordUserAudit(...args),
}));

import { actorLogoRecommendationRoutes } from "../../src/routes/actor-logo-recommendations.js";
import { requireActorApiKeyCapability, requireApiKeyMethodScope } from "../../src/middleware/api-key-scope.js";

function app(actorIds?: string[], scopes = ["actors:read", "actors:write"]) {
  const instance = new Hono();
  instance.onError(onErrorHandler);
  instance.use("*", async (c: any, next) => {
    c.set("session", {
      userId: "user_1",
      email: "owner@example.com",
      plan: "PRO",
      businessProfileId: "workspace_1",
      ...(actorIds ? { authMethod: "api-key", apiKeyActorIds: actorIds, apiKeyScopes: scopes } : {}),
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
  },
  logo: {
    id: "logo_1",
    storagePath:
      "website-logos/google-maps/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp",
    checksum: "a".repeat(64),
    contentType: "image/webp",
    websiteIdentity: { id: "website_1", name: "Google Maps", canonicalDomain: "maps.google.com" },
  },
};

describe("Actor logo recommendation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.actorLogoRecommendation.findMany.mockResolvedValue([recommendation]);
    db.actorLogoRecommendation.count.mockResolvedValue(1);
    db.actorLogoRecommendation.findFirst.mockResolvedValue(recommendation);
    db.actorLogoRecommendation.update.mockResolvedValue(recommendation);
    db.actor.update.mockResolvedValue({ id: "actor_1" });
    db.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    );
    recordUserAudit.mockResolvedValue(undefined);
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

  it("keeps a recommendation pending when publishing credentials are unavailable", async () => {
    getUserApifyClient.mockResolvedValue(null);
    const response = await app().request("/actors/logo-recommendations/recommendation_1/apply", {
      method: "POST",
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("apify_publishing_credentials_required");
    expect(db.actorLogoRecommendation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "recommendation_1" },
        data: expect.objectContaining({ error: expect.stringContaining("unavailable") }),
      }),
    );
  });

  it("uploads the approved logo through Apify and records it as applied", async () => {
    getUserApifyClient.mockResolvedValue({ updateActorMetadata });
    readWebsiteLogo.mockResolvedValue(Buffer.from("logo"));
    updateActorMetadata.mockResolvedValue({ pictureUrl: "https://api.apify.com/logo.webp" });
    const response = await app().request("/actors/logo-recommendations/recommendation_1/apply", {
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(updateActorMetadata).toHaveBeenCalledWith(
      "apify_actor_1",
      expect.objectContaining({ picture: expect.objectContaining({ contentType: "image/webp" }) }),
    );
    expect(db.actor.update).toHaveBeenCalledWith({
      where: { id: "actor_1" },
      data: { currentImageUrl: "https://api.apify.com/logo.webp" },
    });
    expect(db.actorLogoRecommendation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPLIED" }) }),
    );
  });

  it.each([
    [403, "Insufficient permissions"],
    [429, "Too Many Requests"],
  ])("keeps the recommendation pending after an Apify %s response", async (_status, message) => {
    getUserApifyClient.mockResolvedValue({ updateActorMetadata });
    readWebsiteLogo.mockResolvedValue(Buffer.from("logo"));
    updateActorMetadata.mockRejectedValue(new Error(message));
    const response = await app().request("/actors/logo-recommendations/recommendation_1/apply", {
      method: "POST",
    });
    expect(response.status).toBe(502);
    expect(db.actorLogoRecommendation.update).toHaveBeenCalledWith({
      where: { id: "recommendation_1" },
      data: { error: message },
    });
    expect(db.actor.update).not.toHaveBeenCalled();
  });

  it("dismisses a recommendation without modifying Apify", async () => {
    const response = await app().request("/actors/logo-recommendations/recommendation_1/dismiss", {
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(db.actorLogoRecommendation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DISMISSED" }) }),
    );
    expect(getUserApifyClient).not.toHaveBeenCalled();
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
      actor: { userId: "user_1", businessProfileId: "workspace_1", apifyActorId: { in: ["other_actor"] } },
    };
    expect(db.actorLogoRecommendation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(db.actorLogoRecommendation.count).toHaveBeenCalledWith({ where });
  });

  it.each(["apply", "dismiss"])("denies %s outside the selected Actors before any side effect", async (action) => {
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
  });

  it("allows an included Actor while retaining the mutation capability check", async () => {
    const permitted = await app(["apify_actor_1"]).request(
      "/actors/logo-recommendations/recommendation_1/dismiss", { method: "POST" },
    );
    expect(permitted.status).toBe(200);
    db.actorLogoRecommendation.update.mockClear();
    const denied = await app(["apify_actor_1"], ["actors:read"]).request(
      "/actors/logo-recommendations/recommendation_1/dismiss", { method: "POST" },
    );
    expect(denied.status).toBe(403);
    expect(db.actorLogoRecommendation.update).not.toHaveBeenCalled();
  });
});
