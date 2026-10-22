import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  downloadLogoSource,
  discoverOfficialLogo,
  iconCandidatesFromHtml,
  isAutomaticallyTrustedLogoSource,
  isPrivateAddress,
  LOGO_SOURCE_PRIORITY,
  normalizeWebsiteLogo,
  officialLogoCandidatesFromHtml,
  readWebsiteLogo,
  storeWebsiteLogo,
  verifyWebsiteLogoStorage,
  websiteLogoStoragePath,
} from "./index";

const temporaryRoots: string[] = [];

afterEach(async () => {
  delete process.env.WEBSITE_LOGO_STORAGE_PATH;
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })));
});

async function useTemporaryStorage() {
  const root = await mkdtemp(join(tmpdir(), "actorconsole-logo-test-"));
  temporaryRoots.push(root);
  process.env.WEBSITE_LOGO_STORAGE_PATH = root;
  return root;
}

describe("logo catalog safety", () => {
  it("blocks local and private network addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("192.168.1.2")).toBe(true);
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("rechecks every redirect and blocks redirects into private networks", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/internal-logo.png" },
      }),
    );
    await expect(downloadLogoSource("https://8.8.8.8/logo.png", fetchMock)).rejects.toThrow(
      "Private network",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a response declared as a non-image", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("not an image", { status: 200, headers: { "content-type": "text/html" } }),
      );
    await expect(downloadLogoSource("https://8.8.8.8/logo", fetchMock)).rejects.toThrow(
      "supported image",
    );
  });

  it("retries transient website throttling before accepting a logo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("slow down", { status: 429, headers: { "retry-after": "0" } }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("image"), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    await expect(downloadLogoSource("https://8.8.8.8/logo.png", fetchMock)).resolves.toMatchObject({
      contentType: "image/png",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "user-agent": expect.stringContaining("ActorConsoleLogoCatalog"),
    });
  });

  it("prefers large apple touch icons over favicons", () => {
    const candidates = iconCandidatesFromHtml(
      '<link rel="icon" sizes="32x32" href="/favicon.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple.png">',
      "https://example.com/page",
    );
    expect(candidates[0]).toMatchObject({
      url: "https://example.com/apple.png",
      kind: "APPLE_TOUCH_ICON",
    });
  });

  it("extracts explicit official logos while ignoring social preview images", () => {
    const candidates = officialLogoCandidatesFromHtml(
      `<meta property="og:image" content="/hero.png">
       <meta itemprop="logo" content="/brand-meta.svg">
       <link rel="logo" href="/brand-link.svg">
       <script type="application/ld+json">{"@type":"Organization","logo":{"url":"/brand-json.svg"}}</script>`,
      "https://example.com/about",
    );
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "https://example.com/brand-json.svg",
      "https://example.com/brand-link.svg",
      "https://example.com/brand-meta.svg",
    ]);
    expect(candidates.some((candidate) => candidate.url.endsWith("hero.png"))).toBe(false);
  });

  it("downloads an explicit official brand logo before page icons", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '<link rel="apple-touch-icon" sizes="512x512" href="/apple.png"><link rel="logo" href="/official.png">',
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("official"), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    await expect(discoverOfficialLogo("8.8.8.8", fetchMock)).resolves.toMatchObject({
      finalUrl: "https://8.8.8.8/official.png",
      sourceKind: "OFFICIAL_BRAND",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects SVG files with external or executable content", async () => {
    await expect(
      normalizeWebsiteLogo(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ),
    ).rejects.toThrow("Unsafe SVG");
    await expect(
      normalizeWebsiteLogo(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg">${" ".repeat(120_000)}<image href="https://example.com/tracker.png" /></svg>`,
        ),
      ),
    ).rejects.toThrow("Unsafe SVG");
  });

  it("rejects malformed and oversized image payloads", async () => {
    await expect(normalizeWebsiteLogo(Buffer.from("not-an-image"))).rejects.toThrow();
    await expect(normalizeWebsiteLogo(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow(
      "exceeds 5 MB",
    );
  });

  it("normalizes deterministically into an immutable checksum path", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: "#ff6600" },
    })
      .png()
      .toBuffer();
    const first = await normalizeWebsiteLogo(png);
    const second = await normalizeWebsiteLogo(png);
    expect(first.checksum).toBe(second.checksum);
    expect(websiteLogoStoragePath("google-maps", first.checksum)).toBe(
      `website-logos/google-maps/${first.checksum}.webp`,
    );
  });

  it("stores and reads immutable logos from the configured filesystem", async () => {
    const root = await useTemporaryStorage();
    const png = await sharp({
      create: { width: 4, height: 4, channels: 4, background: "#3366ff" },
    })
      .png()
      .toBuffer();

    await expect(verifyWebsiteLogoStorage()).resolves.toEqual({ path: root });
    const stored = await storeWebsiteLogo("google-search", png);
    const absolutePath = join(root, stored.storagePath);

    await expect(readWebsiteLogo(stored.storagePath)).resolves.toEqual(
      await readFile(absolutePath),
    );
    expect(stored.storagePath).toBe(`website-logos/google-search/${stored.checksum}.webp`);
  });

  it("rejects filesystem traversal paths", async () => {
    await useTemporaryStorage();
    await expect(readWebsiteLogo("website-logos/../secrets.webp")).rejects.toThrow(
      "Invalid website logo storage path",
    );
  });

  it("keeps official sources ahead of discovered icons and admin uploads", () => {
    expect(LOGO_SOURCE_PRIORITY.OFFICIAL_BRAND).toBeGreaterThan(LOGO_SOURCE_PRIORITY.WEB_MANIFEST);
    expect(LOGO_SOURCE_PRIORITY.WEB_MANIFEST).toBeGreaterThan(
      LOGO_SOURCE_PRIORITY.APPLE_TOUCH_ICON,
    );
    expect(LOGO_SOURCE_PRIORITY.APPLE_TOUCH_ICON).toBeGreaterThan(LOGO_SOURCE_PRIORITY.FAVICON);
    expect(LOGO_SOURCE_PRIORITY.FAVICON).toBeGreaterThan(LOGO_SOURCE_PRIORITY.ADMIN_UPLOAD);
    expect(isAutomaticallyTrustedLogoSource("WEB_MANIFEST")).toBe(true);
    expect(isAutomaticallyTrustedLogoSource("APPLE_TOUCH_ICON")).toBe(true);
    expect(isAutomaticallyTrustedLogoSource("OFFICIAL_BRAND")).toBe(true);
    expect(isAutomaticallyTrustedLogoSource("FAVICON")).toBe(false);
    expect(isAutomaticallyTrustedLogoSource("ADMIN_UPLOAD")).toBe(false);
  });
});
