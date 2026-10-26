import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const { db, tx } = vi.hoisted(() => {
  const transactionClient = {
    websiteIdentity: { findUnique: vi.fn(), update: vi.fn() },
    websiteLogo: { update: vi.fn() },
    actorLogoRecommendation: { createMany: vi.fn(), updateMany: vi.fn() },
    notification: { createMany: vi.fn() },
  };
  return {
    tx: transactionClient,
    db: {
      websiteLogo: { findFirst: vi.fn(), count: vi.fn(), upsert: vi.fn() },
      websiteIdentity: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      actor: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
      storeActor: { count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
      storeCatalogSync: { findMany: vi.fn() },
      session: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@actorconsole/db", () => ({ db, Prisma: { DbNull: "DB_NULL" } }));
vi.mock("@actorconsole/logo-catalog", () => ({
  downloadLogoSource: vi.fn(),
  storeWebsiteLogo: vi.fn(),
}));
const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("../../src/lib/queue.js", () => ({ enqueue }));

import { adminWebsiteLogoRoutes } from "../../src/routes/admin-website-logos.js";
import { storeWebsiteLogo } from "@actorconsole/logo-catalog";

function request(path: string, init?: RequestInit) {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.route("/admin/website-logos", adminWebsiteLogoRoutes);
  return app.request(path, {
    ...init,
    headers: { "x-admin-api-key": "admin-test-key", ...(init?.headers ?? {}) },
  });
}

describe("Admin website logo routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = "admin-test-key";
    db.$transaction.mockImplementation(
      async (input: ((client: typeof tx) => Promise<unknown>) | Array<Promise<unknown>>) =>
        typeof input === "function" ? input(tx) : Promise.all(input),
    );
    db.websiteLogo.findFirst.mockResolvedValue({ id: "logo_2", websiteIdentityId: "website_1" });
    db.actor.findMany.mockResolvedValue([
      { id: "actor_1", userId: "user_1", businessProfileId: "workspace_1" },
      { id: "actor_2", userId: "user_1", businessProfileId: "workspace_1" },
      { id: "actor_3", userId: "user_2", businessProfileId: "workspace_2" },
    ]);
    tx.websiteIdentity.findUnique.mockResolvedValue({
      currentLogoId: "logo_1",
      name: "Google Maps",
    });
    tx.websiteLogo.update.mockResolvedValue({});
    tx.websiteIdentity.update.mockResolvedValue({});
    tx.actorLogoRecommendation.createMany.mockResolvedValue({ count: 3 });
    tx.actorLogoRecommendation.updateMany.mockResolvedValue({ count: 0 });
    tx.notification.createMany.mockResolvedValue({ count: 2 });
    db.storeActor.updateMany.mockResolvedValue({ count: 0 });
    db.actor.updateMany.mockResolvedValue({ count: 0 });
    db.websiteIdentity.update.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it("rejects a file above the 5 MiB image cap before normalization or database writes", async () => {
    db.websiteIdentity.findUnique.mockResolvedValue({ id: "website_1" });
    const body = new FormData();
    body.set("file", new File([new Uint8Array(5 * 1024 * 1024 + 1)], "fixture.png", { type: "image/png" }));
    const response = await request("/admin/website-logos/website_1/upload", { method: "POST", body });
    expect(response.status).toBe(413);
    expect(storeWebsiteLogo).not.toHaveBeenCalled();
    expect(db.websiteLogo.upsert).not.toHaveBeenCalled();
  });

  it("preserves accepted uploads through the image normalizer", async () => {
    db.websiteIdentity.findUnique.mockResolvedValue({ id: "website_1" });
    vi.mocked(storeWebsiteLogo).mockResolvedValue({
      storagePath: "website-logos/website_1/checksum.webp", checksum: "checksum", contentType: "image/webp", width: 512, height: 512, byteSize: 100,
    });
    db.websiteLogo.upsert.mockResolvedValue({ id: "logo_1" });
    const body = new FormData();
    body.set("file", new File(["fabricated image"], "fixture.png", { type: "image/png" }));
    const response = await request("/admin/website-logos/website_1/upload", { method: "POST", body });
    expect(response.status).toBe(200);
    expect(storeWebsiteLogo).toHaveBeenCalledWith("website_1", Buffer.from("fabricated image"));
  });

  it("activates a version and creates deduplicated workspace notifications", async () => {
    const response = await request("/admin/website-logos/website_1/logos/logo_2/activate", {
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { affectedActors: 3 } });
    expect(tx.actorLogoRecommendation.createMany).toHaveBeenCalledWith({
      data: [
        { actorId: "actor_1", logoId: "logo_2" },
        { actorId: "actor_2", logoId: "logo_2" },
        { actorId: "actor_3", logoId: "logo_2" },
      ],
      skipDuplicates: true,
    });
    expect(tx.actorLogoRecommendation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING", logoId: { not: "logo_2" } }),
        data: { status: "SUPERSEDED", error: null },
      }),
    );
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          businessProfileId: "workspace_1",
          dedupeKey: "website-logo:logo_2:workspace:workspace_1",
          body: expect.stringContaining("2 Actors"),
        }),
        expect.objectContaining({
          businessProfileId: "workspace_2",
          dedupeKey: "website-logo:logo_2:workspace:workspace_2",
          body: expect.stringContaining("1 Actor"),
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it("clears admin overrides and queues deterministic reclassification", async () => {
    db.storeActor.findMany.mockResolvedValue([{ apifyActorId: "apify_1" }]);
    db.actor.findMany.mockResolvedValue([{ apifyActorId: "apify_1" }]);
    db.storeActor.updateMany.mockResolvedValue({ count: 1 });
    db.actor.updateMany.mockResolvedValue({ count: 1 });
    enqueue.mockResolvedValue("job_1");
    const response = await request("/admin/website-logos/reclassify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorIds: ["store_1"], workspaceActorIds: ["actor_1"] }),
    });
    expect(response.status).toBe(202);
    expect(db.storeActor.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          websiteIdentityId: null,
          websiteAdminOverride: false,
          websiteClassificationError: null,
        }),
      }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      "catalog",
      { catalog: "websites" },
      expect.objectContaining({ jobId: expect.stringMatching(/^website-reclassification-\d+$/) }),
    );
  });

  it.each([
    ["classification", "websites", /^website-classification-\d+$/],
    ["logos", "logos", /^website-logos-\d+$/],
  ])("queues a BullMQ-safe %s run id", async (route, catalog, expectedJobId) => {
    enqueue.mockResolvedValue("job_1");
    const response = await request(`/admin/website-logos/runs/${route}`, { method: "POST" });
    expect(response.status).toBe(202);
    expect(enqueue).toHaveBeenCalledWith(
      "catalog",
      { catalog },
      expect.objectContaining({ jobId: expect.stringMatching(expectedJobId) }),
    );
    const options = enqueue.mock.calls.at(-1)?.[2] as { jobId?: string } | undefined;
    expect(options?.jobId).not.toContain(":");
  });

  it("merges a duplicate identity without losing public or workspace assignments", async () => {
    const response = await request("/admin/website-logos/website_target/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceWebsiteId: "website_duplicate" }),
    });
    expect(response.status).toBe(200);
    expect(db.storeActor.updateMany).toHaveBeenCalledWith({
      where: { websiteIdentityId: "website_duplicate" },
      data: { websiteIdentityId: "website_target", websiteAdminOverride: true },
    });
    expect(db.actor.updateMany).toHaveBeenCalledWith({
      where: { websiteIdentityId: "website_duplicate" },
      data: { websiteIdentityId: "website_target", websiteAdminOverride: true },
    });
    expect(db.websiteIdentity.update).toHaveBeenCalledWith({
      where: { id: "website_duplicate" },
      data: { status: "ARCHIVED" },
    });
  });
});
