import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeStaticPublicHtml, addPublishedSitemapUrls } from "./pages-public-html.mjs";
import { pageRewriteRules } from "./pages-routing.mjs";

test("generated fixed pages and documentation bypass SPA rewrites; missing docs keep a real 404", () => {
  const output = mkdtempSync(join(tmpdir(), "actorconsole-public-html-"));
  writeFileSync(
    join(output, "index.html"),
    '<html><head><title>App</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>',
  );
  writeFileSync(
    join(output, "public-metadata.json"),
    JSON.stringify([
      { path: "/", title: "Home" },
      { path: "/features", title: "Features" },
    ]),
  );
  const paths = writeStaticPublicHtml(output, (template) => [
    {
      path: "/docs/start",
      html: template.replace('<div id="root"></div>', '<div id="root"><h1>Start guide</h1></div>'),
    },
  ]);
  assert.match(
    readFileSync(join(output, "features.html"), "utf8"),
    /<title>Features · ActorConsole<\/title>/,
  );
  assert.match(readFileSync(join(output, "docs/start.html"), "utf8"), /Start guide/);
  const rules = pageRewriteRules(
    [
      "(marketing)/features/page.tsx",
      "(marketing)/docs/[slug]/page.tsx",
      "(marketing)/builders/[username]/page.tsx",
    ],
    paths,
  );
  assert.doesNotMatch(rules, /\/features|\/docs/);
  assert.match(rules, /\/builders\/:username/);
});
test("static sitemap includes every published article page and fails on unavailable data", async () => {
  const output = mkdtempSync(join(tmpdir(), "actorconsole-sitemap-"));
  writeFileSync(join(output, "sitemap.xml"), "<urlset></urlset>");
  const fetcher = async (url) => {
    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get("page"));
    return Response.json(
      parsed.pathname === "/blog"
        ? { ok: true, data: [{ slug: `post-${page}` }], pagination: { totalPages: 2 } }
        : { ok: true, data: { items: [{ slug: "release-one" }], total: 1, limit: 100 } },
    );
  };
  assert.equal(await addPublishedSitemapUrls(output, fetcher), 3);
  const xml = readFileSync(join(output, "sitemap.xml"), "utf8");
  assert.match(xml, /\/blog\/post-1/);
  assert.match(xml, /\/blog\/post-2/);
  assert.match(xml, /\/changelog\/release-one/);
  await assert.rejects(
    addPublishedSitemapUrls(output, async () => new Response(null, { status: 503 })),
    /unavailable/,
  );
});
