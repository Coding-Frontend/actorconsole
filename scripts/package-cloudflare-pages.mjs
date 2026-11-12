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
import { join, relative, sep } from "node:path";
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
if (name !== "actorconsole" || pages_build_output_dir !== "./dist-pages") {
  throw new Error("Review the Pages project name and output directory before packaging");
}
const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: app, encoding: "utf8" });
const revision = git.stdout?.trim() ?? "";
if (git.status !== 0 || !/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error("Build the Pages package from a Git checkout with a known revision");
}
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
copyFileSync(join(bundled, "cloudflare-pages.js"), join(output, "_worker.js"));
writeFileSync(
  join(output, "_routes.json"),
  JSON.stringify({ version: 1, include: ["/*"], exclude: [] }),
);
// A root 404 prevents the Pages asset binding from treating missing app routes as an SPA.
writeFileSync(join(output, "404.html"), "<!doctype html><title>Page not found</title>");
console.log(`Packaged ActorConsole Pages in ${output}`);
