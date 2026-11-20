import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Exercise the actual Pages entry without loading the generated Next bundle.
const source = (
  await readFile(new URL("../apps/web/cloudflare-pages.mjs", import.meta.url), "utf8")
)
  .replace(
    'import next from "./.open-next/worker.js";',
    'const next = { fetch: async () => new Response("next-render") };',
  )
  .replace('import "./.open-next/server-functions/default/handler.mjs";', "");
const { default: pages } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const env = { PUBLIC_CATALOG_RENDER_ORIGIN: "https://api.actorconsole.com" };
const catalog = "https://actorconsole.com/builders/bebich/actors/imdb-ratings?window=90";

async function request(path, referer = catalog, options = {}) {
  const {
    origin = "https://actorconsole.com",
    enabled = true,
    rsc = true,
    method = "GET",
  } = options;
  return pages.fetch(
    new Request(origin + path, {
      method,
      headers: { ...(rsc ? { rsc: "1" } : {}), referer },
    }),
    enabled ? env : {},
    {},
  );
}

test("programmatic catalog navigation crosses to comparison and prerendered pages as documents", async () => {
  for (const path of ["/actors/compare/bebich/imdb-ratings?window=90&_rsc=abc", "/docs?_rsc=abc"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(await response.text(), "");
  }
});

test("ordinary Next navigation retains its renderer", async () => {
  for (const [referer, options] of [
    [catalog, { enabled: false }],
    [catalog, { rsc: false }],
    [catalog, { method: "POST" }],
    ["https://actorconsole.com/docs", {}],
    ["https://actorconsole.com/builders/compare/bebich", {}],
    ["https://elsewhere.example/builders/bebich", {}],
    ["invalid", {}],
  ]) {
    assert.equal(
      await (await request("/actors/compare/bebich/imdb-ratings", referer, options)).text(),
      "next-render",
    );
  }
});

test("API reads retain their handler", async () => {
  assert.equal(await (await request("/api/public/builders/bebich")).text(), "next-render");
});

test("preview navigation retains its noindex response and private route guard", async () => {
  const origin = "https://catalog-test.actorconsole-git.pages.dev";
  const referer = origin + "/builders/bebich/actors/imdb-ratings?window=90";
  const response = await request("/actors/compare/bebich/imdb-ratings", referer, { origin });
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("content-type"), "text/html");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal((await request("/login", referer, { origin })).status, 404);
  assert.equal((await request("/api/auth/session", referer, { origin })).status, 404);
});
