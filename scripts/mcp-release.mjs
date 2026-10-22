import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function mcpRelease(manifest, ref) {
  assert.equal(manifest.name, "@actorconsole/mcp", "Only the MCP package may be published");
  assert.notEqual(manifest.private, true, "The MCP package must be public");
  assert.equal(manifest.publishConfig?.access, "public");
  assert.equal(manifest.publishConfig?.registry, "https://registry.npmjs.org");
  assert.equal(manifest.repository?.url, "git+https://github.com/Coding-Frontend/actorconsole.git");
  assert.equal(manifest.repository?.directory, "apps/mcp");
  const version = manifest.version;
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version,
    );
  assert(
    match && match[0] === version && version.length <= 128,
    "Use a canonical SemVer version without build metadata",
  );
  assert(
    match.slice(1, 4).every((n) => Number.isSafeInteger(Number(n))),
    "Version component too large",
  );
  assert(
    !match[4]?.split(".").some((part) => /^0\d+$/.test(part)),
    "Numeric prerelease identifiers cannot have leading zeroes",
  );
  if (ref !== undefined)
    assert.equal(
      ref,
      `refs/tags/mcp-v${version}`,
      "Tag must match the MCP package version exactly",
    );
  return {
    version,
    distTag: match[4] ? "next" : "latest",
    tarball: `actorconsole-mcp-${version}.tgz`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(
    await readFile(new URL("../apps/mcp/package.json", import.meta.url), "utf8"),
  );
  const release = mcpRelease(manifest, process.argv[2]);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `version=${release.version}\ndist-tag=${release.distTag}\ntarball=${release.tarball}\n`,
    );
  }
  process.stdout.write(JSON.stringify(release) + "\n");
}
