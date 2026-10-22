import assert from "node:assert/strict";
import { test } from "node:test";
import { mcpRelease } from "./mcp-release.mjs";

const manifest = {
  name: "@actorconsole/mcp",
  version: "1.2.3",
  publishConfig: { access: "public", registry: "https://registry.npmjs.org" },
  repository: {
    url: "git+https://github.com/Coding-Frontend/actorconsole.git",
    directory: "apps/mcp",
  },
};
test("stable tags publish the exact package version to latest", () => {
  assert.deepEqual(mcpRelease(manifest, "refs/tags/mcp-v1.2.3"), {
    version: "1.2.3",
    distTag: "latest",
    tarball: "actorconsole-mcp-1.2.3.tgz",
  });
});
test("prereleases cannot replace the stable npm dist-tag", () => {
  const pre = { ...manifest, version: "1.3.0-rc.1" };
  assert.equal(mcpRelease(pre, "refs/tags/mcp-v1.3.0-rc.1").distTag, "next");
});
test("branches, unrelated tags and mismatched package versions cannot release", () => {
  for (const ref of [
    "refs/heads/main",
    "refs/tags/v1.2.3",
    "refs/tags/mcp-v1.2.4",
    "refs/tags/mcp-v1.2.3\ninjected=true",
  ]) {
    assert.throws(() => mcpRelease(manifest, ref));
  }
});
test("noncanonical versions and output/path injection are rejected", () => {
  for (const version of [
    "01.2.3",
    "1.2",
    "1.2.3+build",
    "1.2.3-01",
    "1.2.3-rc..1",
    "../../secret",
    "1.2.3\n",
    "1.2.3\nother=value",
    "9007199254740992.0.0",
  ]) {
    assert.throws(() => mcpRelease({ ...manifest, version }));
  }
});
test("private packages, other package names and other publish destinations cannot release", () => {
  for (const change of [
    { private: true },
    { name: "@actorconsole/shared" },
    { publishConfig: { access: "restricted" } },
    { repository: { url: "https://example.com" } },
  ]) {
    assert.throws(() => mcpRelease({ ...manifest, ...change }));
  }
});
