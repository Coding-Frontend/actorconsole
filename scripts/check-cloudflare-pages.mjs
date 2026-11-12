import assert from "node:assert/strict";

const [, , previewUrl, revision] = process.argv;
const origin = new URL(previewUrl);
if (
  (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
) {
  throw new Error("Supply the Pages origin without credentials, a path, or a query");
}

async function check(path, status, method = "GET") {
  const response = await fetch(new URL(path, origin), {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, status, `${method} ${path}`);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/i, path);
  assert.equal(response.headers.get("set-cookie"), null, path);
  return response.text();
}

if (revision) {
  let observed;
  let lastError;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      observed = await check("/_pages/revision", 200);
    } catch (error) {
      lastError = error;
    }
    if (observed === revision) break;
    if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  if (observed !== revision) {
    throw new Error("The Pages URL did not serve the expected revision", { cause: lastError });
  }
}

const home = await check("/", 200);
assert.match(home, /<title>[^<]*ActorConsole/i);
const asset = home.match(/(?:href|src)="(\/_next\/static\/[^"]+)"/)?.[1];
assert(asset, "The Pages homepage must include a built static asset");
await check(asset, 200);
const image = home.match(/src="(\/_next\/image\?[^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
if (image) await check(image, 200);
assert.match(await check("/faq", 200), /ActorConsole/i);
assert.match(await check("/sitemap.xml", 200), /<urlset[\s>]/);
assert.match(await check("/robots.txt", 200), /Disallow: \//);
const health = JSON.parse(await check("/api/health", 200));
assert(health.ok === true || health.status === "ok", "The API health probe did not report ready");

await check("/admin", 404);
await check("/dashboard", 404);
await check("/api/account/workspace-access", 404);
assert.match(await check("/api/health", 405, "POST"), /accepts public reads only/i);
console.log("Cloudflare Pages passed its public pages, API, static asset, and access checks.");
