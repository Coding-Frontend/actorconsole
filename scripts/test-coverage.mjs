import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageNames = [
  "@actorconsole/shared",
  "@actorconsole/ai",
  "@actorconsole/apify",
  "@actorconsole/db",
  "@actorconsole/api",
  "@actorconsole/worker",
  "@actorconsole/web",
];

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = ["--coverage", "--coverage.thresholds.lines=60", "--coverage.thresholds.statements=60"];

// These workspaces have regression suites but no established coverage gate.
// Run them too, while preserving the existing coverage policy above.
const unitTestPackageNames = [
  "@actorconsole/logo-catalog",
  "@actorconsole/chrome-extension",
  "@actorconsole/mcp",
];

export function runCoverage(spawn = spawnSync) {
  for (const packageName of [...packageNames, ...unitTestPackageNames]) {
    const coverageArgs = packageNames.includes(packageName) ? ["--", ...args] : [];
    const result = spawn(pnpm, ["--filter", packageName, "test", ...coverageArgs], {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCoverage();
}
