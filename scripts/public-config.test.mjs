import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const moduleUrl = new URL("../.deploy/pages/public-config.js", import.meta.url).href;
const root = fileURLToPath(new URL("../", import.meta.url));
function config(site, api) {
  return spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { PUBLIC_SITE, PUBLIC_API_ORIGIN } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify([PUBLIC_SITE, PUBLIC_API_ORIGIN]));`], {
    cwd: root, encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_SITE_URL: site, NEXT_PUBLIC_API_BASE_URL: api },
  });
}
test("public documents and API reads can use an independent installation", () => {
  const result = config("https://app.example.org", "https://api.example.org");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ["https://app.example.org", "https://api.example.org"]);
});
test("public origins reject embedded credentials, paths and executable schemes", () => {
  for (const api of ["https://user:password@api.example.org", "https://api.example.org/private", "javascript:alert(1)"])
    assert.notEqual(config("https://app.example.org", api).status, 0);
});
