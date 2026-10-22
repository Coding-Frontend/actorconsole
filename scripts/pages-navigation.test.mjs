import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetReferences, retainPagesAssets } from "./pages-assets.mjs";
import { pageRewriteRules } from "./pages-routing.mjs";

test("only app pages are rewritten; missing assets and APIs remain real errors", () => {
  const rules = pageRewriteRules([
    "(auth)/signup/page.tsx",
    "(marketing)/docs/[...slug]/page.tsx",
    "(dashboard)/dashboard/publishing/schedules/[id]/page.tsx",
    "api/a/route.ts",
    "page.tsx",
    "[...missing]/page.tsx",
  ]);
  assert.match(rules, /\/signup \/ 200/);
  assert.match(rules, /\/docs\/\* \/ 200/);
  assert.match(rules, /\/dashboard\/publishing\/schedules\/:id/);
  assert.doesNotMatch(rules, /^\/\* |\/assets|\/api/m);
});
test("asset graph extracts hashed dependencies without public files or traversal", () => {
  assert.deepEqual(
    assetReferences(
      'import("./page-abcdefgh.js");["index-12345678.css","/logo.png","../evil-12345678.js"];url(font-12345678.woff2)',
    ),
    ["assets/page-abcdefgh.js", "assets/index-12345678.css", "assets/font-12345678.woff2"],
  );
});
test("retains old lazy modules and their dependencies without replacing current code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pages-retain-"));
  try {
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "current index");
    writeFileSync(join(dir, "assets/current-12345678.js"), "current code");
    const files = {
      "deployment-assets.json": "<html>old fallback</html>",
      "index.html": '<script src="/assets/old-12345678.js"></script>',
      "assets/old-12345678.js": 'import("./schedule-12345678.js");import("./current-12345678.js")',
      "assets/schedule-12345678.js": "schedule code",
      "assets/current-12345678.js": "previous code",
    };
    const fetcher = async (url) => {
      const path = new URL(url).pathname.slice(1);
      return new Response(files[path], {
        headers: { "content-type": path.endsWith(".js") ? "text/javascript" : "text/html" },
      });
    };
    assert.deepEqual(await retainPagesAssets(dir, ["https://actorconsole.pages.dev"], fetcher), {
      builds: 2,
      retainedAssets: 2,
    });
    assert.equal(readFileSync(join(dir, "assets/schedule-12345678.js"), "utf8"), "schedule code");
    assert.equal(readFileSync(join(dir, "assets/current-12345678.js"), "utf8"), "current code");
    await assert.rejects(retainPagesAssets(dir, ["https://evil.test"], fetcher), /deployment URL/);
    await assert.rejects(
      retainPagesAssets(
        dir,
        ["https://actorconsole.pages.dev"],
        async () =>
          new Response('<script src="/assets/old-12345678.js"></script>', {
            headers: { "content-type": "text/html" },
          }),
      ),
      /HTML returned/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
