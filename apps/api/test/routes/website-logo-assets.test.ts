import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, readWebsiteLogo } = vi.hoisted(() => ({
  db: { websiteLogo: { findUnique: vi.fn() } },
  readWebsiteLogo: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({ db }));
vi.mock("@actorconsole/logo-catalog", () => ({
  readWebsiteLogo: (...args: unknown[]) => readWebsiteLogo(...args),
}));

import {
  clearWebsiteLogoAssetCache,
  websiteLogoAssetRoutes,
} from "../../src/routes/website-logo-assets.js";
import { apiSecurityHeaders } from "../../src/middleware/security-headers.js";

function app() {
  const instance = new Hono();
  instance.use("*", apiSecurityHeaders);
  instance.get("/private", (c) => c.json({ ok: true }));
  instance.route("/website-logo-assets", websiteLogoAssetRoutes);
  return instance;
}

describe("Website logo assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWebsiteLogoAssetCache();
    delete process.env.WEBSITE_LOGO_PUBLIC_BASE_URL;
    db.websiteLogo.findUnique.mockResolvedValue({
      storagePath: `website-logos/site_1/${"a".repeat(64)}.webp`,
      contentType: "image/webp",
      checksum: "a".repeat(64),
    });
    readWebsiteLogo.mockResolvedValue(Buffer.from("normalized-logo"));
  });

  it("serves a versioned immutable asset with checksum validation headers", async () => {
    const response = await app().request("/website-logo-assets/logo_version_1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("etag")).toBe(`"${"a".repeat(64)}"`);
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(await response.text()).toBe("normalized-logo");
  });

  it("keeps private API responses restricted to their origin", async () => {
    const response = await app().request("/private");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("does not cache a missing storage object as a successful response", async () => {
    readWebsiteLogo.mockRejectedValue(new Error("storage unavailable"));
    const response = await app().request("/website-logo-assets/logo_version_1");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("answers a matching ETag with 304 without reading storage", async () => {
    const response = await app().request("/website-logo-assets/logo_version_1", {
      headers: { "if-none-match": `"${"a".repeat(64)}"` },
    });
    expect(response.status).toBe(304);
    expect(readWebsiteLogo).not.toHaveBeenCalled();
  });

  it("reuses recently served bytes instead of reading storage again", async () => {
    await app().request("/website-logo-assets/logo_version_1");
    const second = await app().request("/website-logo-assets/logo_version_1");
    expect(await second.text()).toBe("normalized-logo");
    expect(readWebsiteLogo).toHaveBeenCalledTimes(1);
  });

  it("redirects to a configured public logo origin", async () => {
    process.env.WEBSITE_LOGO_PUBLIC_BASE_URL = "https://logos.example.com/";
    const response = await app().request("/website-logo-assets/logo_version_1");
    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("location")).toBe(
      `https://logos.example.com/website-logos/site_1/${"a".repeat(64)}.webp`,
    );
    expect(readWebsiteLogo).not.toHaveBeenCalled();
  });
});
