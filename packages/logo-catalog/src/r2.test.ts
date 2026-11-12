import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readWebsiteLogo, storeWebsiteLogo, verifyWebsiteLogoInR2 } from "./index";

describe("R2 website logo migration", () => {
  let root: string;
  let objects: Map<string, Uint8Array<ArrayBuffer>>;
  let puts: string[];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "actorconsole-r2-test-"));
    objects = new Map();
    puts = [];
    vi.stubEnv("WEBSITE_LOGO_STORAGE_PATH", root);
    vi.stubEnv("WEBSITE_LOGO_STORAGE_BACKEND", "filesystem");
    vi.stubEnv("WEBSITE_LOGO_R2_ACCOUNT_ID", "12345678123456781234567812345678");
    vi.stubEnv("WEBSITE_LOGO_R2_BUCKET", "test-logos");
    vi.stubEnv("WEBSITE_LOGO_R2_ACCESS_KEY_ID", "test-access-key");
    vi.stubEnv("WEBSITE_LOGO_R2_SECRET_ACCESS_KEY", "test-secret");
    vi.stubGlobal("fetch", async (request: Request) => {
      const url = new URL(request.url);
      expect(url.hostname).toBe("12345678123456781234567812345678.r2.cloudflarestorage.com");
      expect(request.headers.get("authorization")).toContain("Credential=test-access-key/");
      const key = url.pathname.replace("/test-logos/", "");
      if (request.method === "PUT") {
        expect(request.headers.get("if-none-match")).toBe("*");
        expect(request.headers.get("content-type")).toBe("image/webp");
        puts.push(key);
        if (objects.has(key)) return new Response(null, { status: 412 });
        objects.set(key, new Uint8Array(await request.arrayBuffer()));
        return new Response(null, { status: 200 });
      }
      expect(request.method).toBe("GET");
      const bytes = objects.get(key);
      return bytes
        ? new Response(bytes)
        : new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (root?.startsWith(join(tmpdir(), "actorconsole-r2-test-"))) {
      await rm(root, { recursive: true, force: true });
    }
  });

  async function image() {
    return sharp({
      create: { width: 12, height: 12, channels: 3, background: "#4875ea" },
    })
      .png()
      .toBuffer();
  }

  it("backfills and verifies a legacy file without changing its key", async () => {
    const logo = await storeWebsiteLogo("existing", await image());
    const local = await readFile(join(root, logo.storagePath));
    vi.stubEnv("WEBSITE_LOGO_STORAGE_BACKEND", "r2-mirror");
    expect(await readWebsiteLogo(logo.storagePath)).toEqual(local);

    await verifyWebsiteLogoInR2(logo, true);
    await verifyWebsiteLogoInR2(logo, true);
    expect(puts).toEqual([logo.storagePath]);

    vi.stubEnv("WEBSITE_LOGO_STORAGE_BACKEND", "r2");
    expect(await readWebsiteLogo(logo.storagePath)).toEqual(local);
    objects.set(logo.storagePath, new Uint8Array(local.length));
    await expect(verifyWebsiteLogoInR2(logo, true)).rejects.toThrow("database checksum");
    expect(puts).toHaveLength(1);
  });

  it("preserves a local copy for rollback while using R2 for new logos", async () => {
    vi.stubEnv("WEBSITE_LOGO_STORAGE_BACKEND", "r2-mirror");
    const source = await image();
    const logo = await storeWebsiteLogo("new", source);
    await storeWebsiteLogo("new", source);
    const remote = await readWebsiteLogo(logo.storagePath);
    vi.stubEnv("WEBSITE_LOGO_STORAGE_BACKEND", "filesystem");
    expect(await readWebsiteLogo(logo.storagePath)).toEqual(remote);

    vi.stubEnv("WEBSITE_LOGO_STORAGE_BACKEND", "r2-mirror");
    vi.stubGlobal("fetch", async () => new Response(null, { status: 403 }));
    await expect(readWebsiteLogo(logo.storagePath)).rejects.toThrow("HTTP 403");
  });
});
