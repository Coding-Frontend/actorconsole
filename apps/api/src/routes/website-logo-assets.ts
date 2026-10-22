import { Hono } from "hono";
import { db } from "@actorconsole/db";
import { readWebsiteLogo } from "@actorconsole/logo-catalog";
import type { AppEnv } from "../app.js";

export const websiteLogoAssetRoutes = new Hono<AppEnv>().get("/:logoId", async (c) => {
  const logo = await db.websiteLogo.findUnique({
    where: { id: c.req.param("logoId") },
    select: { storagePath: true, contentType: true, checksum: true },
  });
  if (!logo) return c.json({ ok: false, error: { code: "not_found" } }, 404);
  try {
    const bytes = await readWebsiteLogo(logo.storagePath);
    c.header("content-type", logo.contentType);
    c.header("cache-control", "public, max-age=31536000, immutable");
    c.header("etag", `"${logo.checksum}"`);
    return c.body(new Uint8Array(bytes));
  } catch {
    return c.json({ ok: false, error: { code: "asset_unavailable" } }, 503);
  }
});
