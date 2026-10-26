import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { runCoverage } from "./test-coverage.mjs";

test("the coverage entry point runs every workspace with a test script", () => {
  const expected = ["apps", "packages"].flatMap((directory) =>
    readdirSync(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => JSON.parse(readFileSync(new URL(`../${directory}/${entry.name}/package.json`, import.meta.url), "utf8")))
      .filter((manifest) => manifest.scripts?.test)
      .map((manifest) => manifest.name),
  );
  const commands = [];
  assert.equal(runCoverage((_command, args) => {
    commands.push(args);
    return { status: 0 };
  }), 0);
  assert.deepEqual(commands.map((args) => args[1]).sort(), expected.sort());
  for (const command of commands) assert.equal(command[2], "test");
});

test("existing coverage thresholds remain enforced without imposing a new policy on other suites", () => {
  const gated = new Set([
    "@actorconsole/shared", "@actorconsole/ai", "@actorconsole/apify", "@actorconsole/db",
    "@actorconsole/api", "@actorconsole/worker", "@actorconsole/web",
  ]);
  runCoverage((_command, args) => {
    assert.deepEqual(args.slice(3), gated.has(args[1]) ? [
      "--", "--coverage", "--coverage.thresholds.lines=60", "--coverage.thresholds.statements=60",
    ] : []);
    return { status: 0 };
  });
});

for (const failurePackage of ["@actorconsole/shared", "@actorconsole/logo-catalog", "@actorconsole/mcp"]) {
  test(`a failure in ${failurePackage} fails the entry point and stops subsequent work`, () => {
    const calls = [];
    assert.equal(runCoverage((_command, args) => {
      calls.push(args[1]);
      return { status: args[1] === failurePackage ? 7 : 0 };
    }), 7);
    assert.equal(calls.at(-1), failurePackage);
  });
}

test("a terminated subprocess fails the entry point", () => {
  assert.equal(runCoverage(() => ({ status: null, signal: "SIGTERM" })), 1);
});

test("a process launch error is not swallowed", () => {
  const error = new Error("Test subprocess could not start");
  assert.throws(() => runCoverage(() => ({ status: null, error })), (caught) => caught === error);
});
