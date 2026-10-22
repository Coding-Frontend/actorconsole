import { build } from "esbuild";
import { chmod, copyFile, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const outputDir = resolve(packageDir, "dist");
if (dirname(outputDir) !== resolve(packageDir)) throw new Error("Invalid MCP output directory");

const manifest = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
for (const dependencies of [manifest.dependencies, manifest.optionalDependencies]) {
  for (const [name, version] of Object.entries(dependencies ?? {})) {
    if (name.startsWith("@actorconsole/") || /^(workspace:|file:|link:)/.test(version)) {
      throw new Error(`Unpublishable runtime dependency: ${name}`);
    }
  }
}

await rm(outputDir, { recursive: true, force: true });
const result = await build({
  absWorkingDir: packageDir,
  entryPoints: ["src/index.ts", "src/server.ts"],
  outdir: outputDir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20.19",
  packages: "external",
  metafile: true,
  // Bundle only the internal modules used by MCP, directly from source. The
  // published package never needs a private workspace package or its build.
  plugins: [
    {
      name: "actorconsole-internals",
      setup(builder) {
        builder.onResolve({ filter: /^@actorconsole\/shared(?:\/telemetry)?$/ }, ({ path }) => ({
          path: resolve(
            packageDir,
            "../../packages/shared/src",
            path.endsWith("/telemetry") ? "telemetry.ts" : "schemas/pricing.ts",
          ),
        }));
        builder.onResolve({ filter: /^@actorconsole\// }, ({ path }) => {
          throw new Error(`Unexpected private import in MCP build: ${path}`);
        });
      },
    },
  ],
});

// Catch new dependencies that work through hoisting locally but are missing
// from the consumer's package manifest.
const publicDependencies = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
]);
for (const output of Object.values(result.metafile.outputs)) {
  for (const dependency of output.imports.filter((item) => item.external)) {
    if (dependency.path.startsWith("node:")) continue;
    const name = dependency.path.startsWith("@")
      ? dependency.path.split("/").slice(0, 2).join("/")
      : dependency.path.split("/")[0];
    if (!publicDependencies.has(name)) throw new Error(`Undeclared runtime dependency: ${name}`);
  }
}
await copyFile(join(packageDir, "types/server.d.ts"), join(outputDir, "server.d.ts"));
await chmod(join(outputDir, "index.js"), 0o755);
process.stderr.write(`Built ${manifest.name}@${manifest.version} for npm.\n`);
