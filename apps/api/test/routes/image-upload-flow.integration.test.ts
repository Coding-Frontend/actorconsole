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
// IMAGE_FLOW_BROWSER=1 also tests the real Next.js UI (requires free port 23808).
const databaseUrl = process.env.IMAGE_FLOW_TEST_DATABASE_URL;
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
      vi.stubEnv("CORS_ORIGINS", "http://127.0.0.1:23808,http://localhost:8080");

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
        const actorMatch = /^\/v2\/(?:acts|actors)\/([^/]+)$/.exec(path);
        if (actorMatch) {
          const id = decodeURIComponent(actorMatch[1]);
          const actor = remoteActors.get(id);
          if (!actor) return json(null, 404);
          if (req.method === "PUT") {
            const payload = JSON.parse(bytes.toString());
            if (
              !uploadedImages.has(id) ||
              payload.pictureUrl !== `${upstreamUrl}/storage/${id}.webp`
            )
              return json(null, 400);
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
      ({ app } = await import("../../src/app.js"));
    }, 30_000);

    beforeEach(async () => {
      remoteActors.clear();
      uploadedImages.clear();
      upstreamRequests.length = 0;
      ignoreMetadataUpdate = false;
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
          },
        });
      }
    });

    afterAll(async () => {
      if (db) {
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

    it.skipIf(!process.env.IMAGE_FLOW_BROWSER)(
      "uploads, activates and applies through the real Next.js UI in Chromium",
      async () => {
        const { serve } = await import("@hono/node-server");
        const { chromium, expect: browserExpect } = await import("@playwright/test");
        const check = browserExpect.configure({ timeout: 30_000 });
        const require = createRequire(import.meta.url);
        const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
        const webUrl = "http://127.0.0.1:23808";
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
            "23808",
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
              ready = (
                await originalFetch(`${webUrl}/api/health`, {
                  signal: AbortSignal.timeout(5_000),
                })
              ).ok;
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
            viewport: { width: 1440, height: 1000 },
          });
          await context.addCookies([
            { name: "authjs.session-token", value: cookie.split("=")[1], url: webUrl },
            { name: "actorconsole.business-profile", value: workspaceId, url: webUrl },
          ]);
          await context.addInitScript(() =>
            localStorage.setItem(
              "actorconsole.cookie-consent",
              JSON.stringify({ version: 1, choice: "essential", timestamp: Date.now() }),
            ),
          );
          const page = await context.newPage();
          page.setDefaultTimeout(30_000);
          const pageErrors: string[] = [];
          page.on("pageerror", (error) => pageErrors.push(error.message));
          await page.goto("/admin/website-logos", { timeout: 60_000 });
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
          const item = (await recommendations()).items[0];
          const applied = page.waitForResponse(
            (response) =>
              response.url().endsWith(`/logo-recommendations/${item.id}/apply`) &&
              response.request().method() === "POST",
          );
          await page.getByRole("button", { name: "Review logos", exact: true }).click();
          await page.getByRole("button", { name: "Apply to Apify", exact: true }).click();
          expect((await applied).status()).toBe(200);
          await check(page.locator('[data-picture-source="actor"]:visible')).toHaveCount(1);
          const actor = await db.actor.findUniqueOrThrow({ where: { id: item.actorId } });
          await check(page.locator('[data-picture-source="actor"]:visible')).toHaveAttribute(
            "data-picture-url",
            actor.currentImageUrl!,
          );
          await check(page.locator('[data-picture-source="actor"]:visible img')).toHaveJSProperty(
            "naturalWidth",
            512,
          );
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "image-flow-applied-desktop.png"),
            fullPage: true,
          });
          await page.setViewportSize({ width: 390, height: 844 });
          await check(page.locator('[data-picture-source="actor"]:visible')).toHaveCount(1);
          await check(page.locator('[data-picture-source="website"]:visible')).toHaveCount(1);
          await page.screenshot({
            path: join(workspaceRoot, ".cache", "image-flow-applied-mobile.png"),
            fullPage: true,
          });
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
      180_000,
    );
  },
);
