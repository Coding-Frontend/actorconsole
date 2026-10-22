import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";

test("fresh setup isolates browser config and preserves existing credentials on rerun", () => {
  const root = mkdtempSync(join(tmpdir(), "actorconsole-local-env-"));
  for (const directory of ["scripts", "apps/worker", "apps/web", "apps/chrome-extension"])
    mkdirSync(join(root, directory), { recursive: true });
  for (const file of ["scripts/setup-local-env.mjs", ".env.example", ".env.web.example", ".env.extension.example"])
    copyFileSync(new URL(`../${file}`, import.meta.url), join(root, file));
  const run = () => spawnSync(process.execPath, ["scripts/setup-local-env.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(run().status, 0);
  const initial = readFileSync(join(root, ".env"), "utf8");
  const env = parseEnv(initial);
  const secrets = [env.AUTH_SECRET, env.ADMIN_API_KEY, env.APP_ENCRYPTION_KEY, env.MYSQL_APP_PASSWORD, env.MYSQL_ROOT_PASSWORD];
  assert.equal(new Set(secrets).size, 5);
  for (const value of secrets) assert.match(value, /^[a-f0-9]{64}$/);
  assert.equal(new URL(env.DATABASE_URL).password, env.MYSQL_APP_PASSWORD);
  const web = readFileSync(join(root, "apps/web/.env.local"), "utf8");
  for (const value of secrets) assert.ok(!web.includes(value));
  assert.ok(!web.includes("DATABASE_URL="));
  assert.equal(readFileSync(join(root, "apps/worker/.env"), "utf8"), initial);
  writeFileSync(join(root, "apps/web/.env.local"), "EXISTING_CONFIG=preserve-me\n");
  assert.equal(run().status, 0);
  assert.equal(readFileSync(join(root, ".env"), "utf8"), initial);
  assert.equal(readFileSync(join(root, "apps/web/.env.local"), "utf8"), "EXISTING_CONFIG=preserve-me\n");
});
