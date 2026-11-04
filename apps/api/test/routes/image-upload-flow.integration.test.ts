import { createServer, type Server } from "node:http";
import { createWriteStream } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Provision the current Prisma schema in a disposable local database, then set
// DATABASE_URL and IMAGE_FLOW_TEST_DATABASE_URL to that same database URL.
// IMAGE_FLOW_BROWSER=1 also tests the real Next.js UI. Optionally choose its
// loopback port with IMAGE_FLOW_BROWSER_PORT (defaults to 23808).
const databaseUrl = process.env.IMAGE_FLOW_TEST_DATABASE_URL;
const browserPort = Number(process.env.IMAGE_FLOW_BROWSER_PORT ?? 23808);
let db: typeof import("@actorconsole/db").db;
let reconcile: typeof import("@actorconsole/db").reconcileActorLogoRecommendations;
let app: typeof import("../../src/app.js").app;
let upstream: Server;
let upstreamUrl: string;
let storageRoot: string;
let cookie: string;
let userId: string;
let workspaceId: string;
let otherWorkspaceId: string;
let websiteId: string;
let logoId: string;
let ignoreMetadataUpdate = false;
let ignoreSeoUpdate = false;
let providerId: string;
const generatedVariants = [1, 2, 3].map((index) => ({
  title: `Verified listing variant ${index}`,
  description: `A reviewable description for test variant ${index}.`,
  seoTitle: `Verified SEO variant ${index}`,
  seoDescription: `Verified search description for test variant ${index}.`,
  reasoning: "Uses the existing Actor capabilities.",
}));
const userIds: string[] = [];
const websiteIds: string[] = [];
const remoteActors = new Map<string, Record<string, unknown>>();
const uploadedImages = new Map<string, Buffer>();
const upstreamRequests: Array<{ method: string; path: string }> = [];
const originalFetch = globalThis.fetch;

async function request(path: string, init: RequestInit = {}, workspace = workspaceId) {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  headers.set("x-business-profile-id", workspace);
  return app.request(path, { ...init, headers });
}

async function upload(format: "png" | "jpeg" | "webp" | "svg" = "png") {
  const image = sharp({ create: { width: 240, height: 120, channels: 4, background: "#ff6600" } });
  const bytes =
    format === "svg"
      ? Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#ff6600"/></svg>',
        )
      : await image.toFormat(format).toBuffer();
  const body = new FormData();
  body.set(
    "file",
    new File([new Uint8Array(bytes)], `logo.${format}`, {
      type: format === "svg" ? "image/svg+xml" : `image/${format}`,
    }),
  );
  const response = await request(`/admin/website-logos/${websiteId}/upload`, {
    method: "POST",
    body,
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  logoId = result.data.id;
  expect(result.data).toMatchObject({
    width: 512,
    height: 512,
    contentType: "image/webp",
    reviewStatus: "PENDING",
  });
  return result.data as { id: string; assetUrl: string; checksum: string };
}

async function activate() {
  const response = await request(`/admin/website-logos/${websiteId}/logos/${logoId}/activate`, {
    method: "POST",
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function recommendations(workspace = workspaceId) {
  const response = await request("/actors/logo-recommendations?limit=200", {}, workspace);
  expect(response.status).toBe(200);
  return (await response.json()).data as {
    items: Array<{ id: string; actorId: string; proposedImageUrl: string }>;
    total: number;
  };
}

describe.skipIf(!databaseUrl)(
  "image upload and apply flow (real API, MySQL, image processing and Apify client)",
  () => {
    beforeAll(async () => {
      const target = new URL(databaseUrl!);
      if (
        target.protocol !== "mysql:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
        !/^\/actorconsole_e2e_image_upload(?:_[a-z0-9_]+)?$/.test(target.pathname) ||
        process.env.DATABASE_URL !== databaseUrl
      ) {
        throw new Error(
          "IMAGE_FLOW_TEST_DATABASE_URL and DATABASE_URL must identify the same dedicated local actorconsole_e2e_image_upload database",
        );
      }
      storageRoot = await mkdtemp(join(tmpdir(), "actorconsole-image-flow-"));
      vi.stubEnv("WEBSITE_LOGO_STORAGE_PATH", storageRoot);
      vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
      vi.stubEnv("REDIS_ENABLED", "false");
      vi.stubEnv("CORS_ORIGINS", `http://127.0.0.1:${browserPort},http://localhost:8080`);

      upstream = createServer(async (req, res) => {
        const path = new URL(req.url!, "http://localhost").pathname;
        upstreamRequests.push({ method: req.method!, path });
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const bytes = Buffer.concat(chunks);
        const json = (data: unknown, status = 200) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify({ data }));
        };
        if (path === "/ai/chat/completions") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify({ variants: generatedVariants }) } }],
            }),
          );
          return;
        }
        if (path === "/v2/users/me")
          return json({
            id: "fixture-user",
            username: "image-builder",
            isProfilePublic: true,
            primaryEmailVerified: true,
            primaryEmailDisposable: false,
            plan: { id: "PRO" },
          });
        const actorMatch = /^\/v2\/(?:acts|actors)\/([^/]+)$/.exec(path);
        if (actorMatch) {
          const id = decodeURIComponent(actorMatch[1]);
          const actor = remoteActors.get(id);
          if (!actor) return json(null, 404);
          if (req.method === "PUT") {
            const payload = JSON.parse(bytes.toString());
            if (
              payload.pictureUrl &&
              payload.pictureUrl !== actor.pictureUrl &&
              (!uploadedImages.has(id) ||
                payload.pictureUrl !== `${upstreamUrl}/storage/${id}.webp`)
            )
              return json(null, 400);
            if (ignoreSeoUpdate) {
              delete payload.seoTitle;
              delete payload.seoDescription;
            }
            if (!ignoreMetadataUpdate) Object.assign(actor, payload);
          }
          return json(actor);
        }
        if (/^\/v2\/(?:acts|actors)$/.test(path)) {
          return json({
            items: [...remoteActors.values()],
            total: remoteActors.size,
            count: remoteActors.size,
            offset: 0,
            limit: 1000,
          });
        }
        const basicMatch = /^\/actor\/([^/]+)\/basic-info$/.exec(path);
        if (basicMatch) return json(remoteActors.get(decodeURIComponent(basicMatch[1])) ?? null);
        const uploadMatch = /^\/upload\/actor-picture\/([^/]+)$/.exec(path);
        if (uploadMatch) {
          if (!req.headers.authorization?.startsWith("Bearer apify_ui_")) return json(null, 401);
          const input = JSON.parse(bytes.toString());
          if (input.contentType !== "image/webp" || !input.fileName.endsWith(".webp"))
            return json(null, 400);
          const id = decodeURIComponent(uploadMatch[1]);
          return json({
            uploadUrl: `${upstreamUrl}/storage/${id}.webp`,
            publicUrl: `${upstreamUrl}/storage/${id}.webp`,
          });
        }
        const storageMatch = /^\/storage\/([^/]+)\.webp$/.exec(path);
        if (storageMatch) {
          const id = decodeURIComponent(storageMatch[1]);
          if (req.method === "PUT") {
            if (req.headers["content-type"] !== "image/webp") return json(null, 400);
            uploadedImages.set(id, bytes);
            return json({});
          }
          res.writeHead(200, { "content-type": "image/webp" });
          res.end(uploadedImages.get(id));
          return;
        }
        json(null, 404);
      });
      await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
      upstreamUrl = `http://127.0.0.1:${(upstream.address() as { port: number }).port}`;
      vi.stubEnv("APIFY_API_BASE_URL", upstreamUrl);
      vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin === "https://console-backend.apify.com") {
          return originalFetch(`${upstreamUrl}${url.pathname}${url.search}`, init);
        }
        if (url.origin !== upstreamUrl)
          throw new Error(`Unexpected external request in image-flow test: ${url.origin}`);
        return originalFetch(input, init);
      });
      ({ db, reconcileActorLogoRecommendations: reconcile } = await import("@actorconsole/db"));
      const { encrypt } = await import("@actorconsole/shared");
      const credentialId = randomUUID();
      const provider = await db.aiProvider.create({
        data: {
          key: `image-flow-${randomUUID()}`,
          type: "openai",
          name: "Local flow fixture",
          enabled: true,
          priority: 1,
          model: "fixture-model",
          baseUrl: `${upstreamUrl}/ai/chat/completions`,
          credentials: {
            create: {
              id: credentialId,
              label: "Local fixture",
              encryptedApiKey: encrypt(
                "local-fixture-only",
                process.env.APP_ENCRYPTION_KEY!,
                `ai-provider-credential:${credentialId}`,
              ),
            },
          },
        },
      });
      providerId = provider.id;
      ({ app } = await import("../../src/app.js"));
    }, 30_000);

    beforeEach(async () => {
      remoteActors.clear();
      uploadedImages.clear();
      upstreamRequests.length = 0;
      ignoreMetadataUpdate = false;
      ignoreSeoUpdate = false;
      const suffix = randomUUID();
      const user = await db.user.create({
        data: {
          email: `image-${suffix}@example.test`,
          role: "ADMIN",
          plan: "PRO",
          emailVerified: new Date(),
        },
      });
      userId = user.id;
      userIds.push(userId);
      const workspace = await db.businessProfile.create({
        data: { userId, slug: "images", name: "Image test", plan: "PRO", isDefault: true },
      });
      workspaceId = workspace.id;
      otherWorkspaceId = (
        await db.businessProfile.create({
          data: { userId, slug: "other", name: "Other image test", plan: "PRO" },
        })
      ).id;
      cookie = `authjs.session-token=${suffix}`;
      await db.session.create({
        data: { userId, sessionToken: suffix, expires: new Date(Date.now() + 3_600_000) },
      });
      const { encrypt } = await import("@actorconsole/shared");
      for (const businessProfileId of [workspaceId, otherWorkspaceId]) {
        await db.apifyToken.create({
          data: {
            userId,
            businessProfileId,
            encryptedToken: encrypt(
              "apify_api_image_flow_fixture",
              process.env.APP_ENCRYPTION_KEY!,
              "apify",
            ),
            encryptedUiToken: encrypt(
              "apify_ui_image_flow_fixture_123456789",
              process.env.APP_ENCRYPTION_KEY!,
              "apify-ui",
            ),
            apiTokenStatus: "VALID",
            uiTokenStatus: "VALID",
          },
        });
      }
      websiteId = (
        await db.websiteIdentity.create({
          data: { slug: `image-${suffix}`, name: "Image website", canonicalDomain: "example.com" },
        })
      ).id;
      websiteIds.push(websiteId);
      for (let index = 0; index < 3; index += 1) {
        const id = `apify_${suffix}_${index}`;
        const actor = {
          id,
          username: "image-builder",
          name: `actor-${index}`,
          title: `Original Actor ${index}`,
          description: `Preserved description ${index}`,
          pictureUrl: null,
          categories: ["DEVELOPER_TOOLS"],
          seoTitle: "Preserved SEO title",
          seoDescription: "Preserved SEO description",
          isPublic: index !== 1,
          isSourceCodeHidden: true,
          pricingInfos: [],
        };
        remoteActors.set(id, actor);
        await db.actor.create({
          data: {
            userId,
            businessProfileId: index === 2 ? otherWorkspaceId : workspaceId,
            apifyActorId: id,
            username: actor.username,
            actorName: actor.name,
            title: actor.title,
            description: actor.description,
            websiteIdentityId: websiteId,
            storeIsPublic: actor.isPublic,
            storeIsDeprecated: false,
            storeNotice: "NONE",
            storeStatusSyncedAt: new Date(),
          },
        });
      }
    });

    afterAll(async () => {
      if (db) {
        if (providerId) await db.aiProvider.delete({ where: { id: providerId } });
        await db.user.deleteMany({ where: { id: { in: userIds } } });
        await db.storeActor.deleteMany({ where: { websiteIdentityId: { in: websiteIds } } });
        await db.websiteIdentity.deleteMany({ where: { id: { in: websiteIds } } });
        await db.$disconnect();
      }
      if (upstream) {
        upstream.closeAllConnections();
        await new Promise<void>((done) => upstream.close(() => done()));
      }
      if (storageRoot) {
        if (!resolve(storageRoot).startsWith(`${resolve(tmpdir())}${sep}actorconsole-image-flow-`))
          throw new Error("Unexpected image test storage path");
        await rm(storageRoot, { recursive: true, force: true });
      }
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    it.each(["png", "jpeg", "webp", "svg"] as const)(
      "uploads %s, activates, and applies verified bytes to every matching fixture Actor",
      async (format) => {
        const logo = await upload(format);
        const asset = await app.request(logo.assetUrl.replace(/^\/api/, ""));
        expect(asset.status).toBe(200);
        const normalized = Buffer.from(await asset.arrayBuffer());
        expect(await sharp(normalized).metadata()).toMatchObject({
          format: "webp",
          width: 512,
          height: 512,
        });
        expect((await recommendations()).total).toBe(0);
        expect((await activate()).data.affectedActors).toBe(3);
        const own = await recommendations();
        const other = await recommendations(otherWorkspaceId);
        expect(own.total).toBe(2);
        expect(other.total).toBe(1);
        expect(
          (
            await request(`/actors/logo-recommendations/${other.items[0].id}/apply`, {
              method: "POST",
            })
          ).status,
        ).toBe(404);
        for (const [workspace, items] of [
          [workspaceId, own.items],
          [otherWorkspaceId, other.items],
        ] as const) {
          for (const item of items) {
            const before = await db.actor.findUniqueOrThrow({ where: { id: item.actorId } });
            const requestOffset = upstreamRequests.length;
            const response = await request(
              `/actors/logo-recommendations/${item.id}/apply`,
              { method: "POST" },
              workspace,
            );
            expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
            const pictureUrl = (await response.json()).data.pictureUrl;
            expect(upstreamRequests.slice(requestOffset).map((call) => call.method)).toEqual([
              "GET",
              "GET",
              "POST",
              "PUT",
              "PUT",
              "GET",
              "GET",
            ]);
            expect(uploadedImages.get(before.apifyActorId)).toEqual(normalized);
            expect(remoteActors.get(before.apifyActorId)).toMatchObject({
              pictureUrl,
              title: before.title,
              description: before.description,
              seoTitle: "Preserved SEO title",
              seoDescription: "Preserved SEO description",
            });
            expect(await db.actor.findUniqueOrThrow({ where: { id: before.id } })).toMatchObject({
              currentImageUrl: pictureUrl,
            });
            expect(
              await db.actorLogoRecommendation.findUniqueOrThrow({ where: { id: item.id } }),
            ).toMatchObject({ status: "APPLIED", error: null, appliedAt: expect.any(Date) });
          }
        }
        expect((await recommendations()).total).toBe(0);
        expect((await recommendations(otherWorkspaceId)).total).toBe(0);
        expect(
          await db.auditLog.count({ where: { actorId: userId, action: "actor.logo.applied" } }),
        ).toBe(3);
      },
    );

    it("adds recommendations after late assignment while preserving applied and dismissed decisions", async () => {
      await upload();
      await activate();
      const own = await recommendations();
      expect(
        (await request(`/actors/logo-recommendations/${own.items[0].id}/apply`, { method: "POST" }))
          .status,
      ).toBe(200);
      expect(
        (
          await request(`/actors/logo-recommendations/${own.items[1].id}/dismiss`, {
            method: "POST",
          })
        ).status,
      ).toBe(200);
      const late = await db.actor.create({
        data: {
          userId,
          businessProfileId: workspaceId,
          apifyActorId: `late_${randomUUID()}`,
          username: "image-builder",
          actorName: "late",
          title: "Late Actor",
        },
      });
      const assignment = await request(`/admin/website-logos/${websiteId}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceActorIds: [late.id] }),
      });
      expect(assignment.status).toBe(200);
      expect((await recommendations()).items.map((item) => item.actorId)).toEqual([late.id]);
      await reconcile({ userId, businessProfileId: workspaceId });
      expect((await recommendations()).total).toBe(1);
      expect(
        await db.actorLogoRecommendation.count({
          where: {
            actor: { businessProfileId: workspaceId },
            status: { in: ["APPLIED", "DISMISSED"] },
          },
        }),
      ).toBe(2);
    });

    it("recommends all 501 matching Actors across batches and paginated reads", async () => {
      await db.actor.createMany({
        data: Array.from({ length: 499 }, (_, index) => ({
          userId,
          businessProfileId: workspaceId,
          apifyActorId: `batch_${userId}_${index}`,
          username: "image-builder",
          actorName: `batch-${index}`,
          websiteIdentityId: websiteId,
        })),
      });
      await upload();
      await activate();
      expect((await recommendations()).total).toBe(501);
      const seen = new Set<string>();
      for (let page = 1; page <= 3; page += 1) {
        const response = await request(`/actors/logo-recommendations?limit=200&page=${page}`);
        for (const item of (await response.json()).data.items) seen.add(item.actorId);
      }
      expect(seen.size).toBe(501);
      const selected = new Set<string>();
      let after: string | null = null;
      do {
        const response = await request(
          `/actors/logo-recommendations/selection${after ? `?after=${after}` : ""}`,
        );
        expect(response.status).toBe(200);
        const data = (await response.json()).data;
        for (const item of data.items) selected.add(item.actor.id);
        after = data.nextCursor;
      } while (after);
      expect(selected).toEqual(seen);
    });

    it("recommends an active logo immediately after importing a newly catalog-matched Actor", async () => {
      await upload();
      await activate();
      for (const [id, actor] of remoteActors) if (actor.name === "actor-2") remoteActors.delete(id);
      const id = `late_sync_${randomUUID()}`;
      remoteActors.set(id, {
        id,
        username: "image-builder",
        name: `late-sync-${userId}`,
        title: "Late synced Actor",
        description: "Imported after logo activation",
        pictureUrl: null,
        categories: [],
        pricingInfos: [],
        isPublic: true,
      });
      await db.storeActor.create({
        data: {
          apifyActorId: id,
          username: "image-builder",
          actorName: `late-sync-${userId}`,
          websiteIdentityId: websiteId,
          websiteConfidence: 1,
          websiteMethod: "admin",
        },
      });
      const response = await request("/actors/sync", { method: "POST" });
      expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
      const actor = await db.actor.findUniqueOrThrow({
        where: {
          businessProfileId_apifyActorId: { businessProfileId: workspaceId, apifyActorId: id },
        },
      });
      expect(actor.websiteIdentityId).toBe(websiteId);
      expect((await recommendations()).items.some((item) => item.actorId === actor.id)).toBe(true);
    });

    it("keeps missing-credential updates pending while another workspace can still apply its logo", async () => {
      await upload();
      await activate();
      const own = (await recommendations()).items[0];
      await db.apifyToken.delete({ where: { businessProfileId: workspaceId } });
      const unavailable = await request(`/actors/logo-recommendations/${own.id}/apply`, {
        method: "POST",
      });
      expect(unavailable.status).toBe(409);
      expect(
        await db.actorLogoRecommendation.findUniqueOrThrow({ where: { id: own.id } }),
      ).toMatchObject({ status: "PENDING", appliedAt: null });
      const other = (await recommendations(otherWorkspaceId)).items[0];
      expect(
        (
          await request(
            `/actors/logo-recommendations/${other.id}/apply`,
            { method: "POST" },
            otherWorkspaceId,
          )
        ).status,
      ).toBe(200);
    });

    it("recommends existing logos through the shared background import path and repairs older unmatched Actors", async () => {
      await upload();
      await activate();
      const { admitWorkspaceActors } = await import("@actorconsole/db");
      const inventory = ["legacy", "new", "manual"].map((name) => ({
        id: `background_${userId}_${name}`,
        username: "image-builder",
        name: `background-${userId}-${name}`,
        title: `Background ${name}`,
        description: null,
        pictureUrl: null,
        stats: null,
      }));
      await db.storeActor.createMany({
        data: inventory.map((actor) => ({
          apifyActorId: actor.id,
          username: actor.username,
          actorName: actor.name,
          websiteIdentityId: websiteId,
          websiteMethod: "DOMAIN",
          websiteConfidence: 0.93,
          websiteEvidence: { match: "example.com" },
          websiteClassifiedAt: new Date(),
        })),
      });
      const legacy = await db.actor.create({
        data: {
          userId,
          businessProfileId: workspaceId,
          apifyActorId: inventory[0].id,
          username: "image-builder",
          actorName: inventory[0].name,
        },
      });
      const manual = await db.actor.create({
        data: {
          userId,
          businessProfileId: workspaceId,
          apifyActorId: inventory[2].id,
          username: "image-builder",
          actorName: inventory[2].name,
          websiteAdminOverride: true,
        },
      });
      const other = await db.actor.create({
        data: {
          userId,
          businessProfileId: otherWorkspaceId,
          apifyActorId: inventory[0].id,
          username: "image-builder",
          actorName: inventory[0].name,
        },
      });
      const admission = await admitWorkspaceActors(userId, workspaceId, inventory);
      expect(admission.created).toBe(1);
      const linked = await db.actor.findMany({
        where: {
          userId,
          businessProfileId: workspaceId,
          apifyActorId: { in: inventory.slice(0, 2).map((actor) => actor.id) },
        },
      });
      expect(linked).toHaveLength(2);
      for (const actor of linked) {
        expect(actor).toMatchObject({
          websiteIdentityId: websiteId,
          websiteMethod: "DOMAIN",
          websiteConfidence: 0.93,
          websiteEvidence: { match: "example.com" },
        });
        expect((await recommendations()).items.some((item) => item.actorId === actor.id)).toBe(
          true,
        );
      }
      expect(linked.some((actor) => actor.id === legacy.id)).toBe(true);
      expect(await db.actor.findUniqueOrThrow({ where: { id: manual.id } })).toMatchObject({
        websiteIdentityId: null,
        websiteAdminOverride: true,
      });
      expect(await db.actor.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({
        websiteIdentityId: null,
      });
      expect(
        await db.actorLogoRecommendation.count({
          where: { actorId: { in: [manual.id, other.id] } },
        }),
      ).toBe(0);
    });

    it("rejects oversized uploads before storing or recommending an image", async () => {
      const body = new FormData();
      body.set(
        "file",
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "oversized.png", { type: "image/png" }),
      );
      expect(
        (await request(`/admin/website-logos/${websiteId}/upload`, { method: "POST", body }))
          .status,
      ).toBe(413);
      expect(await db.websiteLogo.count({ where: { websiteIdentityId: websiteId } })).toBe(0);
      expect((await recommendations()).total).toBe(0);
    });

    it("keeps a verification mismatch pending and does not claim a thumbnail was applied", async () => {
      await upload();
      await activate();
      ignoreMetadataUpdate = true;
      const item = (await recommendations()).items[0];
      const response = await request(`/actors/logo-recommendations/${item.id}/apply`, {
        method: "POST",
      });
      expect(response.status).toBe(502);
      expect(await db.actor.findUniqueOrThrow({ where: { id: item.actorId } })).toMatchObject({
        currentImageUrl: null,
      });
      expect(
        await db.actorLogoRecommendation.findUniqueOrThrow({ where: { id: item.id } }),
      ).toMatchObject({
        status: "PENDING",
        appliedAt: null,
        error: expect.stringContaining("verification mismatch"),
      });
    });

    it("generates, reviews and applies all copy fields with real provider HTTP, auth, MySQL and Apify verification", async () => {
      const remote = [...remoteActors.values()][0];
      const before = structuredClone(remote);
      const generated = await request(`/actors/${remote.id}/rewrite-copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(generated.status, JSON.stringify(await generated.clone().json())).toBe(200);
      const data = (await generated.json()).data;
      expect(data.variants).toEqual(generatedVariants);
      expect(data.currentCopy).toMatchObject({ title: before.title, seoTitle: before.seoTitle });
      const { reasoning: _reasoning, ...copy } = generatedVariants[0];
      const applied = await request(`/actors/${remote.id}/copy`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...copy, expectedCopy: data.currentCopy }),
      });
      expect(applied.status, JSON.stringify(await applied.clone().json())).toBe(200);
      expect((await applied.json()).data.verified).toBe(true);
      expect(remote).toMatchObject(copy);
      expect(remote).toMatchObject({
        pictureUrl: before.pictureUrl,
        categories: before.categories,
        isPublic: before.isPublic,
      });
      const row = await db.actor.findUniqueOrThrow({
        where: {
          businessProfileId_apifyActorId: {
            businessProfileId: workspaceId,
            apifyActorId: String(remote.id),
          },
        },
      });
      expect(await db.copyVariant.count({ where: { actorId: row.id, isActive: true } })).toBe(4);
      expect(row.currentCopy).toMatchObject(copy);
    });

    it("rejects stale copy before writing and leaves history unchanged after an SEO verification mismatch", async () => {
      const remote = [...remoteActors.values()][0];
      const expectedCopy = Object.fromEntries(
        ["title", "description", "seoTitle", "seoDescription"].map((field) => [
          field,
          remote[field] ?? null,
        ]),
      );
      remote.title = "A newer external edit";
      const beforeWrites = upstreamRequests.filter((call) => call.method === "PUT").length;
      const stale = await request(`/actors/${remote.id}/copy`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Generated old proposal", expectedCopy }),
      });
      expect(stale.status).toBe(409);
      expect(upstreamRequests.filter((call) => call.method === "PUT")).toHaveLength(beforeWrites);
      ignoreSeoUpdate = true;
      const mismatch = await request(`/actors/${remote.id}/copy`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seoTitle: "Requested SEO title" }),
      });
      expect(mismatch.status).toBe(502);
      const row = await db.actor.findUniqueOrThrow({
        where: {
          businessProfileId_apifyActorId: {
            businessProfileId: workspaceId,
            apifyActorId: String(remote.id),
          },
        },
      });
      expect(await db.copyVariant.count({ where: { actorId: row.id, isActive: true } })).toBe(0);
      expect(remote.seoTitle).toBe(expectedCopy.seoTitle);
    });

    it("schedules and verifies tiered prices without changing current prices, history or billing settings", async () => {
      const remote = [...remoteActors.values()][0];
      const existing = {
        pricingModel: "PAY_PER_EVENT",
        startedAt: "2025-01-01T00:00:00.000Z",
        minimalMaxTotalChargeUsd: 2,
        isPPEPlatformUsagePaidByUser: false,
        isPriceChangeNotificationSuppressed: false,
        apifyMarginPercentage: 0.15,
        pricingPerEvent: {
          actorChargeEvents: {
            result: {
              eventTitle: "Result",
              isPrimaryEvent: true,
              eventTieredPricingUsd: {
                FREE: { tieredEventPriceUsd: 0.01 },
                GOLD: { tieredEventPriceUsd: 0.005 },
              },
            },
          },
        },
      };
      remote.pricingInfos = [existing];
      const events = {
        result: {
          ...existing.pricingPerEvent.actorChargeEvents.result,
          eventTieredPricingUsd: {
            FREE: { tieredEventPriceUsd: 0.01 },
            GOLD: { tieredEventPriceUsd: 0.003 },
          },
        },
      };
      const update = () =>
        request(`/actors/${remote.id}/pricing`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pricing: { model: "PAY_PER_EVENT", events },
            reason: "Reviewed tier update",
          }),
        });
      const response = await update();
      expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
      const result = (await response.json()).data;
      expect(result).toMatchObject({ changed: true, verified: true });
      expect(Date.parse(result.startedAt)).toBeGreaterThan(Date.now());
      const periods = remote.pricingInfos as Array<typeof existing>;
      expect(periods).toHaveLength(2);
      expect(periods[0]).toEqual(existing);
      expect(periods[1]).toMatchObject({
        isPPEPlatformUsagePaidByUser: false,
        minimalMaxTotalChargeUsd: 2,
        apifyMarginPercentage: 0.15,
        pricingPerEvent: { actorChargeEvents: events },
      });
      const state = await request(`/actors/${remote.id}/pricing`);
      const saved = (await state.json()).data;
      expect(saved.active).toEqual(existing);
      expect(saved.scheduled).toHaveLength(1);
      const duplicate = await update();
      expect((await duplicate.json()).data.changed).toBe(false);
      const beforeWrites = upstreamRequests.filter((call) => call.method === "PUT").length;
      const anotherChange = structuredClone(events);
      anotherChange.result.eventTieredPricingUsd.GOLD.tieredEventPriceUsd = 0.002;
      const pending = await request(`/actors/${remote.id}/pricing`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pricing: { model: "PAY_PER_EVENT", events: anotherChange } }),
      });
      expect(pending.status).toBe(422);
      expect(upstreamRequests.filter((call) => call.method === "PUT")).toHaveLength(beforeWrites);
      expect(remote.pricingInfos).toHaveLength(2);
      const row = await db.actor.findUniqueOrThrow({
        where: {
          businessProfileId_apifyActorId: {
            businessProfileId: workspaceId,
            apifyActorId: String(remote.id),
          },
        },
      });
      expect(await db.pricingHistory.count({ where: { actorId: row.id } })).toBe(1);
      expect(
        (await db.pricingHistory.findFirstOrThrow({ where: { actorId: row.id } })).payload,
      ).toMatchObject({ events, startedAt: result.startedAt });
    });

    it("does not record unverified pricing and rejects accidental tier flattening", async () => {
      const remote = [...remoteActors.values()][0];
      remote.pricingInfos = [
        {
          pricingModel: "PAY_PER_EVENT",
          startedAt: "2025-01-01T00:00:00.000Z",
          pricingPerEvent: {
            actorChargeEvents: {
              result: {
                eventTitle: "Result",
                eventTieredPricingUsd: {
                  FREE: { tieredEventPriceUsd: 0.01 },
                  GOLD: { tieredEventPriceUsd: 0.005 },
                },
              },
            },
          },
        },
      ];
      const flattened = await request(`/actors/${remote.id}/pricing`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pricing: {
            model: "PAY_PER_EVENT",
            events: { result: { eventTitle: "Result", eventPriceUsd: 0.01 } },
          },
        }),
      });
      expect(flattened.status).toBe(422);
      ignoreMetadataUpdate = true;
      const mismatch = await request(`/actors/${remote.id}/pricing`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pricing: {
            model: "PAY_PER_EVENT",
            events: {
              result: {
                eventTitle: "Result",
                eventTieredPricingUsd: {
                  FREE: { tieredEventPriceUsd: 0.02 },
                  GOLD: { tieredEventPriceUsd: 0.005 },
                },
              },
            },
          },
        }),
      });
      expect(mismatch.status).toBe(502);
      const row = await db.actor.findUniqueOrThrow({
        where: {
          businessProfileId_apifyActorId: {
            businessProfileId: workspaceId,
            apifyActorId: String(remote.id),
          },
        },
      });
      expect(await db.pricingHistory.count({ where: { actorId: row.id } })).toBe(0);
    });

    it("creates a paused publishing schedule, preserves Actor order, and rejects another workspace's Actors", async () => {
      const own = await db.actor.findMany({
        where: { userId, businessProfileId: workspaceId },
        orderBy: { id: "asc" },
      });
      const other = await db.actor.findFirstOrThrow({
        where: { userId, businessProfileId: otherWorkspaceId },
      });
      const create = (actorIds: string[]) =>
        request("/bulk-publishing/schedules", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Verified test queue",
            actorIds,
            cronExpr: "0 2 * * *",
            dailyLimit: 1,
            enabled: false,
          }),
        });
      expect((await create([other.id])).status).toBe(404);
      const response = await create(own.map((actor) => actor.id).reverse());
      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
      const schedule = (await response.json()).data;
      expect(schedule).toMatchObject({
        businessProfileId: workspaceId,
        enabled: false,
        nextRunAt: null,
      });
      expect(schedule.actors.map((item: { actorId: string }) => item.actorId)).toEqual(
        own.map((actor) => actor.id).reverse(),
      );
      expect(
        (await request(`/bulk-publishing/schedules/${schedule.id}`, {}, otherWorkspaceId)).status,
      ).toBe(404);
      expect(
        (await request(`/bulk-publishing/schedules/${schedule.id}`, { method: "DELETE" })).status,
      ).toBe(200);
    });

    it("scopes bulk review filters, status totals and cursor selection to the active workspace", async () => {
      await upload();
      await activate();
      const response = await request(
        `/actors/logo-recommendations?summary=true&q=Original%20Actor&websiteId=${websiteId}&thumbnail=missing`,
      );
      expect(response.status).toBe(200);
      const page = (await response.json()).data;
      expect(page).toMatchObject({
        total: 2,
        workspaceId,
        summary: { counts: { PENDING: 2, APPLIED: 0, DISMISSED: 0 } },
      });
      expect(page.summary.websites).toHaveLength(1);
      const selected: string[] = [];
      let after: string | null = null;
      do {
        const result = await request(
          `/actors/logo-recommendations/selection?limit=1&websiteId=${websiteId}${after ? `&after=${after}` : ""}`,
        );
        expect(result.status).toBe(200);
        const body = (await result.json()).data;
        expect(body.workspaceId).toBe(workspaceId);
        selected.push(...body.items.map((item: { id: string }) => item.id));
        after = body.nextCursor;
      } while (after);
      expect(new Set(selected)).toEqual(new Set(page.items.map((item: { id: string }) => item.id)));
      const foreign = await request(
        `/actors/logo-recommendations?summary=true&websiteId=${websiteId}`,
        {},
        otherWorkspaceId,
      );
      expect((await foreign.json()).data).toMatchObject({
        total: 1,
        workspaceId: otherWorkspaceId,
        summary: { counts: { PENDING: 1 } },
      });
      expect(
        (await request(`/actors/logo-recommendations/${selected[0]}/apply`, { method: "POST" }))
          .status,
      ).toBe(200);
      const providerWrites = upstreamRequests.filter((item) => item.method === "PUT").length;
      expect(
        (await request(`/actors/logo-recommendations/${selected[1]}/dismiss`, { method: "POST" }))
          .status,
      ).toBe(200);
      expect(upstreamRequests.filter((item) => item.method === "PUT")).toHaveLength(providerWrites);
      const history = await request("/actors/logo-recommendations?summary=true&status=DISMISSED");
      expect((await history.json()).data).toMatchObject({
        total: 1,
        summary: { counts: { PENDING: 0, APPLIED: 1, DISMISSED: 1 } },
      });
    });

    it.skipIf(!process.env.IMAGE_FLOW_BROWSER)(
      "verifies image bulk review, copy, tiered pricing and scheduling in desktop and mobile Chromium",
      async () => {
        const { serve } = await import("@hono/node-server");
        const { chromium, expect: browserExpect } = await import("@playwright/test");
        const check = browserExpect.configure({ timeout: 30_000 });
        const template = [...remoteActors.values()][0];
        for (let index = 3; index < 7; index += 1) {
          const id = `bulk-browser-${randomUUID()}`;
          const actor = {
            ...template,
            id,
            name: `bulk-browser-${index}`,
            title: `Bulk Browser Actor ${index}`,
            pictureUrl: null,
            isPublic: false,
          };
          remoteActors.set(id, actor);
          await db.actor.create({
            data: {
              userId,
              businessProfileId: workspaceId,
              apifyActorId: id,
              username: "image-builder",
              actorName: actor.name,
              title: actor.title,
              websiteIdentityId: websiteId,
            },
          });
        }
        const require = createRequire(import.meta.url);
        const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
        const webUrl = `http://127.0.0.1:${browserPort}`;
        const browserRevision = `bulk-logo-browser-${randomUUID()}`;
        const api = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
        if (!api.listening) await new Promise<void>((done) => api.once("listening", done));
        const apiUrl = `http://127.0.0.1:${(api.address() as { port: number }).port}`;
        const log = createWriteStream(join(workspaceRoot, ".cache", "image-flow-browser.log"));
        const web = spawn(
          process.execPath,
          [
            require.resolve("next/dist/bin/next"),
            "dev",
            "--hostname",
            "127.0.0.1",
            "--port",
            String(browserPort),
          ],
          {
            cwd: join(workspaceRoot, "apps", "web"),
            windowsHide: true,
            env: {
              ...process.env,
              NODE_ENV: "development",
              API_BASE_URL: apiUrl,
              NEXT_PUBLIC_API_BASE_URL: "/api",
              NEXT_PUBLIC_SITE_URL: webUrl,
              AUTH_URL: webUrl,
              SENTRY_AUTH_TOKEN: "",
              NEXT_TELEMETRY_DISABLED: "1",
              GIT_SHA: browserRevision,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        web.stdout.pipe(log);
        web.stderr.pipe(log);
        let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
        try {
          const deadline = Date.now() + 90_000;
          let ready = false;
          while (Date.now() < deadline && web.exitCode === null) {
            try {
              const health = await originalFetch(`${webUrl}/api/health`, {
                signal: AbortSignal.timeout(5_000),
              });
              ready = health.ok && (await health.json()).revision === browserRevision;
            } catch {
              /* development server is compiling */
            }
            if (ready) break;
            await new Promise((done) => setTimeout(done, 500));
          }
          expect(ready, "Next.js must start successfully; see .cache/image-flow-browser.log").toBe(
            true,
          );
          browser = await chromium.launch({ headless: true });
          const context = await browser.newContext({
            baseURL: webUrl,
            viewport: { width: 1600, height: 1100 },
            reducedMotion: "reduce",
          });
          await context.addCookies([
            { name: "authjs.session-token", value: cookie.split("=")[1], url: webUrl },
            { name: "actorconsole.business-profile", value: workspaceId, url: webUrl },
          ]);
          await context.addInitScript(() => {
            localStorage.setItem(
              "actorconsole.cookie-consent",
              JSON.stringify({ version: 1, choice: "essential", timestamp: Date.now() }),
            );
            localStorage.setItem("ac-theme", "dark");
          });
          const page = await context.newPage();
          page.setDefaultTimeout(30_000);
          const pageErrors: string[] = [];
          page.on("pageerror", (error) => pageErrors.push(error.message));
          // Warm the development-only auth compilation before its 12s client
          // request budget starts, then wait for the hydrated session request.
          await originalFetch(`${webUrl}/api/auth/session`, {
            headers: { cookie },
            signal: AbortSignal.timeout(60_000),
          });
          await Promise.all([
            page.waitForResponse(
              (response) => new URL(response.url()).pathname === "/api/auth/session",
              { timeout: 90_000 },
            ),
            page.goto("/admin/website-logos", { timeout: 60_000 }),
          ]);
          const website = await db.websiteIdentity.findUniqueOrThrow({
            where: { id: websiteId },
          });
          await page.getByPlaceholder("Search website, service, or domain").fill(website.slug);
          await page.getByRole("button", { name: "Search", exact: true }).click();
          const article = page
            .getByRole("article")
            .filter({ has: page.getByRole("heading", { name: website.name, exact: true }) });
          await check(article).toHaveCount(1);
          const uploaded = page.waitForResponse(
            (response) =>
              response.url().endsWith(`/admin/website-logos/${websiteId}/upload`) &&
              response.request().method() === "POST",
          );
          await article.locator('input[type="file"]').setInputFiles({
            name: "browser.svg",
            mimeType: "image/svg+xml",
            buffer: Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#ff6600"/></svg>',
            ),
          });
          const uploadResponse = await uploaded;
          expect(uploadResponse.status()).toBe(200);
          logoId = (await uploadResponse.json()).data.id;
          const activated = page.waitForResponse(
            (response) =>
              response.url().endsWith(`/logos/${logoId}/activate`) &&
              response.request().method() === "POST",
          );
          await article.getByRole("button", { name: "Activate admin upload", exact: true }).click();
          expect((await activated).status()).toBe(200);
          await check(article.getByRole("button", { name: "Active", exact: true })).toBeVisible();

          await page.goto("/dashboard/actors", { timeout: 60_000 });
          await check(
            page.locator('[data-picture-source="website"]:visible').first(),
          ).toBeVisible();
          const all = (await recommendations()).items;
          expect(all).toHaveLength(6);
          const applyItems = all.slice(0, 2);
          const dismissItems = all.slice(2, 4);
          const untouched = all.slice(4);
          await page.getByRole("link", { name: "Review logos", exact: true }).click();
          await check(
            page.getByRole("heading", { name: "Bulk logo review", exact: true }),
          ).toBeVisible();
          await check(page.locator("tr[data-recommendation-id]")).toHaveCount(6);
          for (const item of applyItems)
            await page
              .locator(`[data-recommendation-id="${item.id}"] input[type="checkbox"]`)
              .check();
          await check(page.getByRole("region", { name: "Bulk logo actions" })).toBeInViewport();
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "bulk-logo-review-desktop.png"),
            fullPage: true,
          });
          await page.getByRole("button", { name: "Apply 2 logos to Apify", exact: true }).click();
          await check(
            page
              .getByRole("dialog")
              .getByRole("list", { name: "Actors in this bulk action" })
              .getByRole("listitem"),
          ).toHaveCount(2);
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Apply 2 logos", exact: true })
            .click();
          await check(
            page.getByText("2 of 2 processed · 2 applied · 0 failed", { exact: true }),
          ).toBeVisible();
          await check(page.locator("tr[data-recommendation-id]")).toHaveCount(4);
          for (const item of applyItems) {
            const actor = await db.actor.findUniqueOrThrow({ where: { id: item.actorId } });
            expect(actor.currentImageUrl).toBe(`${upstreamUrl}/storage/${actor.apifyActorId}.webp`);
            expect(
              (await db.actorLogoRecommendation.findUniqueOrThrow({ where: { id: item.id } }))
                .status,
            ).toBe("APPLIED");
          }
          const providerWrites = upstreamRequests.filter((item) => item.method === "PUT").length;
          for (const item of dismissItems)
            await page
              .locator(`[data-recommendation-id="${item.id}"] input[type="checkbox"]`)
              .check();
          await page.getByRole("button", { name: "Dismiss selected", exact: true }).click();
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Dismiss 2 selected", exact: true })
            .click();
          await check(
            page.getByText("2 of 2 processed · 2 dismissed · 0 failed", { exact: true }),
          ).toBeVisible();
          await check(page.locator("tr[data-recommendation-id]")).toHaveCount(2);
          expect(upstreamRequests.filter((item) => item.method === "PUT")).toHaveLength(
            providerWrites,
          );
          for (const item of dismissItems)
            expect(
              (await db.actorLogoRecommendation.findUniqueOrThrow({ where: { id: item.id } }))
                .status,
            ).toBe("DISMISSED");
          for (const item of untouched)
            expect(
              (await db.actorLogoRecommendation.findUniqueOrThrow({ where: { id: item.id } }))
                .status,
            ).toBe("PENDING");
          await page.getByRole("button", { name: "Applied 2", exact: true }).click();
          await check(page.locator("tr[data-recommendation-id]")).toHaveCount(2);
          await check(page.getByRole("img", { name: /Apify thumbnail$/ }).first()).toHaveJSProperty(
            "naturalWidth",
            512,
          );
          await page.getByRole("button", { name: "Dismissed 2", exact: true }).click();
          await check(page.locator("tr[data-recommendation-id]")).toHaveCount(2);
          await page.getByRole("button", { name: "Needs review 2", exact: true }).click();
          await check(page.locator("tr[data-recommendation-id]")).toHaveCount(2);
          await page
            .locator(`[data-recommendation-id="${untouched[0].id}"] input[type="checkbox"]`)
            .check();
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.setViewportSize({ width: 375, height: 844 });
          await check(page.getByRole("region", { name: "Bulk logo actions" })).toBeInViewport();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "bulk-logo-review-mobile.png"),
            fullPage: true,
          });
          await page.setViewportSize({ width: 844, height: 390 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
          await page.setViewportSize({ width: 1600, height: 1100 });
          await page.getByRole("button", { name: "Toggle color theme", exact: true }).click();
          await check(page.locator("html")).not.toHaveClass(/dark/);
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "bulk-logo-review-light.png"),
            fullPage: true,
          });

          // Keep the provider transport, API handlers, database and real SDK in
          // the browser path. Only external services are local HTTP fixtures.
          const actor = await db.actor.findUniqueOrThrow({ where: { id: applyItems[0].actorId } });
          const remote = remoteActors.get(actor.apifyActorId)!;
          remote.pricingInfos = [
            {
              pricingModel: "PAY_PER_EVENT",
              startedAt: "2025-01-01T00:00:00.000Z",
              isPPEPlatformUsagePaidByUser: false,
              pricingPerEvent: {
                actorChargeEvents: {
                  result: {
                    eventTitle: "Result",
                    isPrimaryEvent: true,
                    eventTieredPricingUsd: {
                      FREE: { tieredEventPriceUsd: 0.01 },
                      GOLD: { tieredEventPriceUsd: 0.005 },
                    },
                  },
                },
              },
            },
          ];
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.goto(`/dashboard/actors/${actor.id}?tab=manage`, { timeout: 60_000 });
          await page.getByRole("button", { name: /^Rewrite copy/ }).click();
          await page.getByRole("button", { name: "Generate variants", exact: true }).click();
          await page.getByRole("button", { name: /Variant 1/ }).click();
          await page.getByRole("button", { name: "Review changes", exact: true }).click();
          for (const viewport of [
            { width: 320, height: 740 },
            { width: 375, height: 812 },
            { width: 768, height: 1024 },
            { width: 1440, height: 1000 },
          ]) {
            await page.setViewportSize(viewport);
            expect(
              await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            ).toBe(true);
            const footer = await page
              .getByRole("button", { name: "Apply selected fields", exact: true })
              .boundingBox();
            expect(footer && footer.y >= 0 && footer.y + footer.height <= viewport.height).toBe(
              true,
            );
          }
          await page
            .getByLabel("Proposed SEO title", { exact: true })
            .fill("Browser verified SEO title");
          const copySaved = page.waitForResponse(
            (response) =>
              response.url().endsWith(`/actors/${actor.apifyActorId}/copy`) &&
              response.request().method() === "PUT",
          );
          await page.getByRole("button", { name: "Apply selected fields", exact: true }).click();
          expect((await copySaved).status()).toBe(200);
          await check(
            page.getByRole("heading", { name: "Listing update verified", exact: true }),
          ).toBeVisible();
          expect(remote.seoTitle).toBe("Browser verified SEO title");
          expect(remote.pictureUrl).toBe(actor.currentImageUrl);
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "actor-flow-copy-verified-desktop.png"),
          });
          await page.getByRole("button", { name: "Done", exact: true }).click();

          await page.setViewportSize({ width: 390, height: 844 });
          await page.getByRole("button", { name: /^Update pay-per-event pricing/ }).click();
          await page.getByLabel("GOLD price (USD)", { exact: true }).fill("0.003");
          await check(
            page.getByRole("button", { name: "Review pricing changes", exact: true }),
          ).toBeEnabled();
          await page.getByRole("button", { name: "Review pricing changes", exact: true }).click();
          const saveButton = page.getByRole("button", {
            name: "Schedule pricing update",
            exact: true,
          });
          for (const viewport of [
            { width: 320, height: 740 },
            { width: 375, height: 812 },
            { width: 768, height: 1024 },
            { width: 390, height: 844 },
          ]) {
            await page.setViewportSize(viewport);
            expect(
              await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            ).toBe(true);
            const footer = await saveButton.boundingBox();
            expect(footer && footer.y >= 0 && footer.y + footer.height <= viewport.height).toBe(
              true,
            );
          }
          const buttonBox = await saveButton.boundingBox();
          expect(buttonBox && buttonBox.y >= 0 && buttonBox.y + buttonBox.height <= 844).toBe(true);
          const dialog = page.getByRole("dialog");
          expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "actor-flow-pricing-review-mobile.png"),
          });
          const pricingSaved = page.waitForResponse(
            (response) =>
              response.url().endsWith(`/actors/${actor.apifyActorId}/pricing`) &&
              response.request().method() === "PUT",
          );
          await saveButton.click();
          expect((await pricingSaved).status()).toBe(200);
          await check(
            page.getByRole("heading", { name: "Pricing schedule verified", exact: true }),
          ).toBeVisible();
          expect(
            (
              remote.pricingInfos as Array<{
                pricingPerEvent: {
                  actorChargeEvents: Record<
                    string,
                    { eventTieredPricingUsd: Record<string, { tieredEventPriceUsd: number }> }
                  >;
                };
              }>
            ).at(-1)?.pricingPerEvent.actorChargeEvents.result.eventTieredPricingUsd,
          ).toEqual({ FREE: { tieredEventPriceUsd: 0.01 }, GOLD: { tieredEventPriceUsd: 0.003 } });
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "actor-flow-pricing-verified-mobile.png"),
          });
          await page.getByRole("button", { name: "Done", exact: true }).click();
          await page.getByRole("tab", { name: "History", exact: true }).click();
          await check(page.getByText("Scheduled from", { exact: false })).toBeVisible();
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "actor-flow-history-mobile.png"),
            fullPage: true,
          });

          await page.goto("/dashboard/publishing", { timeout: 60_000 });
          const privateRemote = [...remoteActors.values()].find(
            (value) => value.isPublic === false,
          )!;
          await page
            .getByRole("checkbox", { name: `Select ${String(privateRemote.title)}`, exact: true })
            .first()
            .check();
          await page.getByRole("link", { name: "Create schedule", exact: true }).click();
          await check(page.getByText("1 Actor selected", { exact: true })).toBeVisible();
          await page
            .getByLabel("Schedule name", { exact: true })
            .fill("Browser verified publishing queue");
          await page.getByLabel("Start automatically after creation", { exact: true }).uncheck();
          for (const viewport of [
            { width: 320, height: 740 },
            { width: 375, height: 812 },
            { width: 768, height: 1024 },
            { width: 390, height: 844 },
          ]) {
            await page.setViewportSize(viewport);
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth + 1,
              ),
            ).toBe(true);
          }
          const bounds = await page
            .locator("main section, main aside, main h2, main input")
            .evaluateAll((elements) =>
              elements
                .filter((el) => el.getBoundingClientRect().width > 0)
                .map((el) => ({
                  right: el.getBoundingClientRect().right,
                  left: el.getBoundingClientRect().left,
                })),
            );
          expect(bounds.every((box) => box.left >= 0 && box.right <= 390)).toBe(true);
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "actor-flow-schedule-mobile.png"),
            fullPage: true,
          });
          await page.getByRole("button", { name: "Review and create", exact: true }).click();
          const scheduleSaved = page.waitForResponse(
            (response) =>
              response.url().endsWith("/bulk-publishing/schedules") &&
              response.request().method() === "POST",
          );
          await page.getByRole("button", { name: "Create paused", exact: true }).click();
          const savedSchedule = await scheduleSaved;
          expect(savedSchedule.status()).toBe(201);
          const schedule = (await savedSchedule.json()).data;
          expect(schedule.enabled).toBe(false);
          await check(
            page.getByText("Browser verified publishing queue", { exact: true }),
          ).toBeVisible();
          expect(
            (await db.bulkPublishSchedule.findUniqueOrThrow({ where: { id: schedule.id } }))
              .enabled,
          ).toBe(false);
          expect(pageErrors).toEqual([]);
        } finally {
          await browser?.close();
          if (web.pid) {
            if (process.platform === "win32")
              spawnSync("taskkill", ["/PID", String(web.pid), "/T", "/F"], {
                windowsHide: true,
                stdio: "ignore",
              });
            else web.kill("SIGTERM");
          }
          log.end();
          await new Promise<void>((done) => api.close(() => done()));
        }
      },
      360_000,
    );
  },
);
