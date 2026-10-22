import { copyFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { retainPagesAssets } from "./pages-assets.mjs";
const envIndex = process.argv.indexOf("--env-file");
const supplied = envIndex >= 0 ? parseEnv(readFileSync(process.argv[envIndex + 1], "utf8")) : {};
const environment = { ...process.env };
for (const [key, value] of Object.entries(supplied))
  if (key.startsWith("NEXT_PUBLIC_")) environment[key] = value;
const local = process.argv.includes("--local-preview");
for (const name of ["NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
  if (!environment[name] && !local) throw new Error(`${name} is required for a Pages release`);
  const url = new URL(environment[name] || (name === "NEXT_PUBLIC_SITE_URL" ? "http://localhost:8080" : "http://localhost:4000"));
  if ((!local && url.protocol !== "https:") || !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error(`${name} must be a ${local ? "HTTP(S)" : "HTTPS"} origin without credentials or a path`);
  environment[name] = url.origin;
}
const origin = environment.NEXT_PUBLIC_API_BASE_URL;
environment.NODE_ENV = "production";
environment.ACTORCONSOLE_PAGES_PREVIEW = local ? "1" : "0";
environment.NEXT_PUBLIC_API_BASE_URL = local ? "http://127.0.0.1:8089" : origin;
// Release-script imports and Vite subprocesses must use the same public origins.
process.env.NEXT_PUBLIC_API_BASE_URL = environment.NEXT_PUBLIC_API_BASE_URL;
process.env.NEXT_PUBLIC_SITE_URL = environment.NEXT_PUBLIC_SITE_URL;
const { writePagesRouting } = await import("./pages-routing.mjs");
const { writeStaticPublicHtml, addPublishedSitemapUrls } = await import("./pages-public-html.mjs");
const cwd = fileURLToPath(new URL("../apps/web/", import.meta.url));
const result = spawnSync("pnpm", ["exec", "vite", "build", "--config", "vite.pages.config.ts"], {
  cwd,
  env: environment,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.status !== 0) process.exit(result.status ?? 1);
const output = fileURLToPath(
  new URL(local ? "../apps/web/dist-pages-preview/" : "../apps/web/dist-pages/", import.meta.url),
);
const prerenderBuild = spawnSync(
  "pnpm",
  ["exec", "vite", "build", "--config", "vite.edge.config.ts", "--mode", "prerender"],
  { cwd, env: environment, stdio: "inherit", shell: process.platform === "win32" },
);
if (prerenderBuild.status !== 0) process.exit(prerenderBuild.status ?? 1);
const { documentationHtml } = await import(
  new URL("../apps/web/.cache/pages-prerender/prerender.mjs", import.meta.url).href +
    `?build=${Date.now()}`
);
const staticPaths = writeStaticPublicHtml(output, documentationHtml);
writePagesRouting(
  output,
  fileURLToPath(new URL("../apps/web/src/app/", import.meta.url)),
  staticPaths,
);
if (!local)
  console.log(
    `Added ${await addPublishedSitemapUrls(output)} published article URLs to the static sitemap.`,
  );
function verify(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (/^(?:functions|_worker\.js|\.env.*|node_modules)$/.test(entry.name))
      throw new Error("Pages must contain static assets only");
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) count += verify(file);
    else {
      if (statSync(file).size > 25 * 1024 * 1024) throw new Error("A Pages asset exceeds 25 MiB");
      count++;
    }
  }
  return count;
}
if (!local) {
  const sources = (supplied.PAGES_RETAIN_FROM || process.env.PAGES_RETAIN_FROM || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  for (let i = 0; i < process.argv.length; i++)
    if (process.argv[i] === "--retain-from") sources.push(process.argv[++i]);
  const retained = await retainPagesAssets(output, sources);
  console.log(`Retained ${retained.retainedAssets} assets across ${retained.builds} builds.`);
}
const files = verify(output);
if (!local) {
  const workerBuild = spawnSync(
    "pnpm",
    ["exec", "vite", "build", "--config", "vite.edge.config.ts", "--mode", "worker"],
    { cwd, env: environment, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (workerBuild.status !== 0) process.exit(workerBuild.status ?? 1);
  copyFileSync(
    fileURLToPath(new URL("../.deploy/pages/_routes.json", import.meta.url)),
    `${output}/_routes.json`,
  );
}
console.log(
  `Verified ${files} static files and ${staticPaths.size} static public HTML routes${local ? "; local preview has no Functions" : "; one bounded Worker for public details and legacy extension requests"}.`,
);
