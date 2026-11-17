import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const app = realpathSync(fileURLToPath(new URL("../apps/web/", import.meta.url)));
const adapter = join(app, ".open-next");
const assets = join(adapter, "assets");
const bundled = join(adapter, "pages-bundle");
const output = join(app, "dist-pages");
const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const { name, pages_build_output_dir, compatibility_date, compatibility_flags } = JSON.parse(
  readFileSync(join(app, "wrangler.json"), "utf8"),
);
if (name !== "actorconsole-git" || pages_build_output_dir !== "./dist-pages") {
  throw new Error("Review the Pages project name and output directory before packaging");
}
const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: app, encoding: "utf8" });
const revision = git.stdout?.trim() ?? "";
if (git.status !== 0 || !/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error("Build the Pages package from a Git checkout with a known revision");
}
const staticRoutes = ["/_next/static/*", "/images/*", "/ai-tools-logos/*"];
const publicFiles = readdirSync(join(app, "public"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.startsWith("_") && !entry.name.startsWith("."))
  .map((entry) => `/${entry.name}`);
const prerenderedPath = "_actorconsole-pages";
const manifest = JSON.parse(readFileSync(join(app, ".next/prerender-manifest.json"), "utf8"));
const prerendered = Object.entries(manifest.routes)
  .filter(([path, route]) => {
    const publicPage =
      ["/about", "/features", "/customers", "/docs"].includes(path) ||
      (/^\/docs\/[a-z0-9-]+$/.test(path) && path !== "/docs/getting-started");
    return publicPage && route.initialRevalidateSeconds === false;
  })
  .map(([path]) => path);
const assetPaths = readdirSync(assets, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `/${relative(assets, join(entry.parentPath, entry.name)).split(sep).join("/")}`)
  .sort();

// Bundle the OpenNext entry with Wrangler's module and Node compatibility rules.
// The dry run writes a local bundle for Pages Functions.
const buildConfig = join(adapter, "wrangler-pages-build.json");
mkdirSync(bundled, { recursive: true });
writeFileSync(
  buildConfig,
  JSON.stringify({
    name,
    main: "../cloudflare-pages.mjs",
    compatibility_date,
    compatibility_flags,
    define: {
      "process.env.ACTORCONSOLE_PAGES_REVISION": JSON.stringify(revision),
      "process.env.ACTORCONSOLE_PAGES_ASSETS": JSON.stringify(JSON.stringify(assetPaths)),
      "process.env.ACTORCONSOLE_PAGES_PRERENDERED": JSON.stringify(JSON.stringify(prerendered)),
    },
  }),
);
const result = spawnSync(
  process.execPath,
  [
    wrangler,
    "deploy",
    "--dry-run",
    "--no-autoconfig",
    "--minify",
    "--config",
    buildConfig,
    "--outdir",
    bundled,
  ],
  { cwd: app, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error("Could not bundle the Pages Function");
const expectedBundle = new Set(["cloudflare-pages.js", "cloudflare-pages.js.map", "README.md"]);
if (readdirSync(bundled).some((file) => !expectedBundle.has(file))) {
  throw new Error("The Pages Function contains extra modules and needs a multi-module package");
}

const outputStat = lstatSync(output, { throwIfNoEntry: false });
if (outputStat && (!outputStat.isDirectory() || realpathSync(output) !== output)) {
  throw new Error("Pages output is not the generated directory inside apps/web");
}
rmSync(output, { recursive: true, force: true });
cpSync(assets, output, { recursive: true });
for (const path of prerendered) {
  const source = join(app, ".next/server/app", path.slice(1));
  const destination = join(output, prerenderedPath, path.slice(1));
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(`${source}.html`, `${destination}.body`);
  copyFileSync(`${source}.rsc`, `${destination}.flight`);
}
copyFileSync(join(bundled, "cloudflare-pages.js"), join(output, "_worker.js"));
writeFileSync(
  join(output, "_routes.json"),
  JSON.stringify({ version: 1, include: ["/*"], exclude: [...staticRoutes, ...publicFiles] }),
);
writeFileSync(
  join(output, "_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "/_next/static/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "https://actorconsole-git.pages.dev/*",
    "  X-Robots-Tag: noindex, nofollow",
    "https://cf-preview.actorconsole.com/*",
    "  X-Robots-Tag: noindex, nofollow",
    "",
  ].join("\n"),
);
// A root 404 prevents the Pages asset binding from treating missing app routes as an SPA.
writeFileSync(join(output, "404.html"), "<!doctype html><title>Page not found</title>");
console.log(`Packaged ActorConsole Pages in ${output}`);
