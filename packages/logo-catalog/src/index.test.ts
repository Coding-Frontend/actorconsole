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
  LOGO_SOURCE_PRIORITY,
  meetsAutoTrustQuality,
  normalizeWebsiteLogo,
  officialLogoCandidatesFromHtml,
  readWebsiteLogo,
  storeWebsiteLogo,
  verifyWebsiteLogoStorage,
  websiteLogoStoragePath,
} from "./index";
import { isPrivateAddress } from "./safe-fetch";

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

  it.each([
    "::ffff:7f00:1", "0:0:0:0:0:ffff:a00:1", "::127.0.0.1", "ff02::1",
    "64:ff9b::7f00:1", "2002:7f00:1::", "2001::1", "not-an-address", "256.1.1.1",
  ])("blocks alternate private and special-use addresses: %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:808:808"])(
    "accepts a public IP address: %s", (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );

  it("stops and cancels an oversized streamed logo before reading the rest", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const response = new Response(new ReadableStream({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
        if (reads >= 20) controller.close();
      },
      cancel,
    }), { headers: { "content-type": "image/png" } });
    await expect(downloadLogoSource("https://8.8.8.8/logo.png", vi.fn().mockResolvedValue(response))).rejects.toThrow("exceeds 5 MB");
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBeLessThan(10);
  });

  it("stops and cancels an oversized chunked official page", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const response = new Response(new ReadableStream({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(500_001));
        if (reads >= 20) controller.close();
      },
      cancel,
    }));
    await expect(discoverOfficialLogo("8.8.8.8", vi.fn().mockResolvedValue(response))).rejects.toThrow("response is too large");
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBeLessThan(6);
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
    const png = await sharp({ create: { width: 256, height: 256, channels: 4, background: "#ff0000" } }).png().toBuffer();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '<link rel="apple-touch-icon" sizes="512x512" href="/apple.png"><link rel="logo" href="/official.png">',
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(png, {
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

  it("keeps looking past a trusted logo too small to approve automatically", async () => {
    const tiny = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#ff0000" } }).png().toBuffer();
    const large = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#00ff00" } }).png().toBuffer();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<link rel="logo" href="/tiny.png"><link rel="apple-touch-icon" sizes="512x512" href="/apple.png">', { headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(tiny, { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response(large, { headers: { "content-type": "image/png" } }));
    const found = await discoverOfficialLogo("8.8.8.8", fetchMock);
    expect(found).toMatchObject({ finalUrl: "https://8.8.8.8/apple.png", sourceKind: "APPLE_TOUCH_ICON" });
    expect(found.normalized.source).toEqual({ width: 512, height: 512, vector: false });
  });

  it("returns the best usable logo for review when none is good enough to trust", async () => {
    const tiny = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#ff0000" } }).png().toBuffer();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<link rel="logo" href="/tiny.png">', { headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(tiny, { headers: { "content-type": "image/png" } }))
      .mockResolvedValue(new Response(null, { status: 404 }));
    const found = await discoverOfficialLogo("8.8.8.8", fetchMock);
    expect(found).toMatchObject({ finalUrl: "https://8.8.8.8/tiny.png", sourceKind: "OFFICIAL_BRAND" });
    expect(meetsAutoTrustQuality(found.normalized.source)).toBe(false);
  });

  it("only auto-trusts sharp, roughly square logos", () => {
    expect(meetsAutoTrustQuality({ width: 512, height: 512, vector: false })).toBe(true);
    expect(meetsAutoTrustQuality({ width: 180, height: 180, vector: false })).toBe(false);
    expect(meetsAutoTrustQuality({ width: 24, height: 24, vector: true })).toBe(true);
    expect(meetsAutoTrustQuality({ width: 600, height: 60, vector: false })).toBe(false);
    expect(meetsAutoTrustQuality({ width: 300, height: 100, vector: true })).toBe(false);
  });

  it("tries another icon when the preferred image cannot be decoded", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#ff0000" } }).png().toBuffer();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<link rel="logo" href="/broken.png"><link rel="apple-touch-icon" href="/apple.png">', { headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(Buffer.from("not an image"), { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response(png, { headers: { "content-type": "image/png" } }));
    await expect(discoverOfficialLogo("8.8.8.8", fetchMock)).resolves.toMatchObject({
      finalUrl: "https://8.8.8.8/apple.png",
      sourceKind: "APPLE_TOUCH_ICON",
    });
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

  it("accepts SVG logos that use local gradients and embedded raster images", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">
      <defs><linearGradient id="g"><stop offset="0" stop-color="#f60"/><stop offset="1" stop-color="#06f"/></linearGradient></defs>
      <rect width="64" height="64" fill="url(#g)"/><use xlink:href="#g"/>
      <image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>
    </svg>`;
    const normalized = await normalizeWebsiteLogo(Buffer.from(svg));
    expect(normalized.source.vector).toBe(true);
    expect(normalized.width).toBe(512);
  });

  it("rejects SVG styles and handlers that reach outside the file", async () => {
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://example.com/a.svg#g)"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(#x);</style></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="//example.com/a.png"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,PHN2Zz4="/></svg>',
    ]) {
      await expect(normalizeWebsiteLogo(Buffer.from(svg))).rejects.toThrow("Unsafe SVG");
    }
  });

  it("decodes favicon.ico files that sharp cannot read", async () => {
    const width = 16;
    const height = 16;
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(width, 4);
    header.writeInt32LE(height * 2, 8);
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    const pixels = Buffer.alloc(width * height * 4);
    for (let index = 0; index < width * height; index += 1) pixels.writeUInt32LE(0xff2266ee, index * 4);
    const mask = Buffer.alloc(4 * height);
    const bitmap = Buffer.concat([header, pixels, mask]);
    const directory = Buffer.alloc(6 + 16);
    directory.writeUInt16LE(1, 2);
    directory.writeUInt16LE(1, 4);
    directory[6] = width;
    directory[7] = height;
    directory.writeUInt16LE(32, 12);
    directory.writeUInt32LE(bitmap.length, 14);
    directory.writeUInt32LE(22, 18);
    const ico = Buffer.concat([directory, bitmap]);

    const normalized = await normalizeWebsiteLogo(ico);
    expect(normalized.source).toEqual({ width: 16, height: 16, vector: false });
    const { data } = await sharp(normalized.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // BGRA 0xff2266ee -> opaque RGB (0x22, 0x66, 0xee) at the centre (WebP is lossy).
    const centre = (256 * 512 + 256) * 4;
    const expected = [0x22, 0x66, 0xee, 255];
    expected.forEach((value, channel) => expect(Math.abs(data[centre + channel]! - value)).toBeLessThanOrEqual(3));
  });

  it("decodes PNG images stored inside ICO files", async () => {
    const png = await sharp({ create: { width: 48, height: 48, channels: 4, background: "#00aa00" } }).png().toBuffer();
    const directory = Buffer.alloc(22);
    directory.writeUInt16LE(1, 2);
    directory.writeUInt16LE(1, 4);
    directory[6] = 48;
    directory[7] = 48;
    directory.writeUInt16LE(32, 12);
    directory.writeUInt32LE(png.length, 14);
    directory.writeUInt32LE(22, 18);
    const normalized = await normalizeWebsiteLogo(Buffer.concat([directory, png]));
    expect(normalized.source).toEqual({ width: 48, height: 48, vector: false });
  });

  it("normalizes AVIF and GIF sources", async () => {
    const base = sharp({ create: { width: 256, height: 256, channels: 4, background: "#123456" } });
    for (const bytes of [await base.clone().avif().toBuffer(), await base.clone().gif().toBuffer()]) {
      const normalized = await normalizeWebsiteLogo(bytes);
      expect(normalized.source).toEqual({ width: 256, height: 256, vector: false });
      expect((await sharp(normalized.bytes).metadata()).format).toBe("webp");
    }
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
