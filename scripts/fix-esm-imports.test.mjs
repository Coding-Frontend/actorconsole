import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

test("compiled ESM remains runnable with static, side-effect, directory and dynamic imports", () => {
  const directory = mkdtempSync(join(tmpdir(), "actorconsole-esm-"));
  try {
    mkdirSync(join(directory, "lib"));
    mkdirSync(join(directory, "nested"));
    writeFileSync(join(directory, "package.json"), '{"type":"module"}');
    writeFileSync(join(directory, "effect.js"), "globalThis.effectLoaded = true;");
    writeFileSync(join(directory, "lib/value.js"), "export const value = 40;");
    writeFileSync(join(directory, "nested/index.js"), "export { value } from '../lib/value'; export const result = 2;");
    const entry = join(directory, "index.js");
    writeFileSync(entry, "import './effect'; export { value } from './lib/value'; export async function load() { return import('./nested'); }");
    const command = [resolve("scripts/fix-esm-imports.mjs"), directory];
    assert.equal(spawnSync(process.execPath, command).status, 0);
    const first = readFileSync(entry, "utf8");
    assert.equal(spawnSync(process.execPath, command).status, 0);
    assert.equal(readFileSync(entry, "utf8"), first);
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `const m = await import(${JSON.stringify(pathToFileURL(entry).href)}); if (!globalThis.effectLoaded) throw new Error('side effect missing'); console.log(m.value + (await m.load()).result);`], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "42");
  } finally {
    // Only remove the exact temporary fixture directory this test created.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("actorconsole-esm-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
