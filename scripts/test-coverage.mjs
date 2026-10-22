import { spawnSync } from "node:child_process";

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

for (const packageName of packageNames) {
  const result = spawnSync(pnpm, ["--filter", packageName, "test", "--", ...args], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
