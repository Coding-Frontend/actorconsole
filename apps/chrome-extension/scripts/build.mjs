import { build, context } from "esbuild";
import { copyFile, mkdir, readdir, rm, readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let localEnv = {};
try { localEnv = parseEnv(await readFile(join(packageRoot, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const environment = { ...localEnv, ...process.env };
function configuredOrigin(name, fallback) {
  const value = environment[name] || fallback;
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error(`${name} must be an HTTPS origin (HTTP is allowed for localhost)`);
  return url.origin;
}
const webOrigin = configuredOrigin("ACTORCONSOLE_EXTENSION_WEB_ORIGIN", "http://localhost:8080");
const apiOrigin = configuredOrigin("ACTORCONSOLE_EXTENSION_API_ORIGIN", "http://localhost:4000");
const require = createRequire(import.meta.url);
const distDir = resolve(packageRoot, "dist");
if (dirname(distDir) !== packageRoot) throw new Error("Refusing to clean an unexpected directory");
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const common = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  sourcemap: false,
  minify: process.env.NODE_ENV === "production",
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "process.env.ACTORCONSOLE_EXTENSION_WEB_ORIGIN": JSON.stringify(webOrigin),
    "process.env.ACTORCONSOLE_EXTENSION_API_ORIGIN": JSON.stringify(apiOrigin),
  },
};

const builds = [
  {
    entryPoints: [join(packageRoot, "src/background.ts")],
    outfile: join(distDir, "background.js"),
    format: "esm",
  },
  {
    entryPoints: [join(packageRoot, "src/content-script.ts")],
    outfile: join(distDir, "content-script.js"),
    format: "iife",
  },
  {
    entryPoints: [join(packageRoot, "src/apify-resume-main.ts")],
    outfile: join(distDir, "apify-resume-main.js"),
    format: "iife",
  },
  {
    entryPoints: [join(packageRoot, "src/apify-resume-relay.ts")],
    outfile: join(distDir, "apify-resume-relay.js"),
    format: "iife",
  },
  {
    entryPoints: [join(packageRoot, "src/sidepanel.ts")],
    outfile: join(distDir, "sidepanel.js"),
    format: "iife",
  },
];

const watch = process.argv.includes("--watch");
if (watch) {
  const contexts = await Promise.all(builds.map((options) => context({ ...common, ...options })));
  await Promise.all(contexts.map((buildContext) => buildContext.watch()));
} else {
  await Promise.all(builds.map((options) => build({ ...common, ...options })));
}

const staticDir = join(packageRoot, "static");
for (const filename of await readdir(staticDir)) {
  if (filename === "manifest.json") continue;
  if (filename.endsWith(".html")) {
    const { writeFile } = await import("node:fs/promises");
    const html = (await readFile(join(staticDir, filename), "utf8")).replaceAll("__ACTORCONSOLE_WEB_ORIGIN__", webOrigin);
    await writeFile(join(distDir, filename), html);
    continue;
  }
  await copyFile(join(staticDir, filename), join(distDir, filename));
}
const manifest = JSON.parse(await readFile(join(staticDir, "manifest.json"), "utf8"));
manifest.homepage_url = webOrigin;
manifest.host_permissions = [...new Set([`${webOrigin}/*`, `${apiOrigin}/*`, ...manifest.host_permissions.filter((value) => value.includes("apify.com"))])];
manifest.content_scripts[0].matches = [`${webOrigin}/*`];
const { writeFile } = await import("node:fs/promises");
await writeFile(join(distDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await copyFile(require.resolve("@xyflow/react/dist/style.css"), join(distDir, "react-flow.css"));
await copyFile(join(packageRoot, "../web/public/favicon-96x96.png"), join(distDir, "icon-96.png"));
await copyFile(
  join(packageRoot, "../web/public/web-app-manifest-192x192.png"),
  join(distDir, "icon-192.png"),
);
