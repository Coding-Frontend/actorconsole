import { Hono } from "hono";
import { db } from "@actorconsole/db";
import { readWebsiteLogo } from "@actorconsole/logo-catalog";
import type { AppEnv } from "../app.js";

const IMMUTABLE = "public, max-age=31536000, immutable";
/** Logo versions never change, so recently served bytes can be reused freely. */
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
const cache = new Map<string, Uint8Array<ArrayBuffer>>();
let cachedBytes = 0;

function cacheGet(storagePath: string) {
  const bytes = cache.get(storagePath);
  if (bytes) {
    // Re-insert to mark as most recently used.
    cache.delete(storagePath);
    cache.set(storagePath, bytes);
  }
  return bytes;
}

function cacheSet(storagePath: string, bytes: Uint8Array<ArrayBuffer>) {
  if (bytes.byteLength > CACHE_MAX_BYTES / 16 || cache.has(storagePath)) return;
  cache.set(storagePath, bytes);
  cachedBytes += bytes.byteLength;
  for (const [key, value] of cache) {
    if (cachedBytes <= CACHE_MAX_BYTES) break;
    cache.delete(key);
    cachedBytes -= value.byteLength;
  }
}

/** Test hook. */
export function clearWebsiteLogoAssetCache() {
  cache.clear();
  cachedBytes = 0;
}

/**
 * Optional public origin for the logo bucket (an R2 custom domain). When set,
 * requests are redirected there so the bytes come from Cloudflare's edge
 * instead of streaming through this server. Unset keeps the private bucket.
 */
function publicLogoBaseUrl() {
  const value = process.env.WEBSITE_LOGO_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export const websiteLogoAssetRoutes = new Hono<AppEnv>().get("/:logoId", async (c) => {
  const logo = await db.websiteLogo.findUnique({
    where: { id: c.req.param("logoId") },
    select: { storagePath: true, contentType: true, checksum: true },
  });
  if (!logo) return c.json({ ok: false, error: { code: "not_found" } }, 404);
  const etag = `"${logo.checksum}"`;
  if (c.req.header("if-none-match")?.split(",").some((value) => value.trim() === etag)) {
    c.header("cache-control", IMMUTABLE);
    c.header("etag", etag);
    return c.body(null, 304);
  }
  const publicBase = publicLogoBaseUrl();
  if (publicBase) {
    // A temporary redirect with a short cache, so turning the setting off
    // takes effect within minutes instead of being remembered by browsers.
    c.header("cache-control", "public, max-age=300");
    return c.redirect(`${publicBase}/${logo.storagePath}`, 302);
  }
  try {
    let bytes = cacheGet(logo.storagePath);
    if (!bytes) {
      bytes = new Uint8Array(await readWebsiteLogo(logo.storagePath));
      cacheSet(logo.storagePath, bytes);
    }
    c.header("content-type", logo.contentType);
    c.header("cache-control", IMMUTABLE);
    c.header("etag", etag);
    return c.body(bytes);
  } catch {
    return c.json({ ok: false, error: { code: "asset_unavailable" } }, 503);
  }
});
