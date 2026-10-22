import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_API_ORIGIN } from "../.deploy/pages/public-config.js";

export function pageRewriteRules(files, staticPaths = new Set()) {
  const paths = new Set();
  for (const file of files) {
    const path = file.replaceAll("\\", "/");
    if (!/(?:^|\/)page\.tsx$/.test(path)) continue;
    const parts = path
      .replace(/(?:^|\/)page\.tsx$/, "")
      .split("/")
      .filter((part) => part && !part.startsWith("("))
      .map((part) =>
        part.startsWith("[...") ? "*" : part.startsWith("[") ? `:${part.slice(1, -1)}` : part,
      );
    const route = `/${parts.join("/")}`;
    if (
      staticPaths.has(route) ||
      (route === "/docs/:slug" && [...staticPaths].some((path) => path.startsWith("/docs/")))
    )
      continue;
    if (route !== "/" && route !== "/*" && !route.startsWith("/api/")) paths.add(route);
  }
  paths.add("/dashboard/*");
  paths.add("/admin/*");
  const sorted = [...paths].sort(
    (a, b) =>
      Number(a.includes("*") || a.includes(":")) - Number(b.includes("*") || b.includes(":")) ||
      b.length - a.length ||
      a.localeCompare(b),
  );
  if (sorted.filter((path) => path.includes("*") || path.includes(":")).length > 100)
    throw new Error("Pages exceeds the dynamic redirect-rule budget");
  // Pages canonicalizes /index.html to /; proxy directly to the canonical root.
  return sorted.map((path) => `${path} / 200`).join("\n");
}
export function writePagesRouting(output, appRoot, staticPaths = new Set()) {
  writeFileSync(
    join(output, "_redirects"),
    `/changelog/feed ${PUBLIC_API_ORIGIN}/changelog/rss 302\n/compare /features 301\n/vs-actorhunt /features 301\n/vs-n8n /features 301\n/vs-bright-data /features 301\n/vs-zyte /features 301\n${pageRewriteRules(readdirSync(appRoot, { recursive: true }), staticPaths)}\n`,
  );
  writeFileSync(
    join(output, "404.html"),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page not found · ActorConsole</title></head><body><h1>Page not found</h1><p><a href="/">Return to ActorConsole</a></p></body></html>\n',
  );
  writeFileSync(
    join(output, "_headers"),
    "/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/deployment-assets.json\n  Cache-Control: no-store\n/404.html\n  Cache-Control: no-store\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
  );
}
