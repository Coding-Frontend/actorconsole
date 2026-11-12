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
  throw new Error("Supply the staging origin without credentials, a path, or a query");
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
  for (let attempt = 0; attempt < 6; attempt++) {
    observed = await check("/_staging/revision", 200);
    if (observed === revision) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  assert.equal(observed, revision, "The staging URL is serving a different revision");
}

const home = await check("/", 200);
assert.match(home, /<title>[^<]*ActorConsole/i);
const asset = home.match(/(?:href|src)="(\/_next\/static\/[^"]+)"/)?.[1];
assert(asset, "The staging homepage must include a built static asset");
await check(asset, 200);
assert.match(await check("/faq", 200), /ActorConsole/i);
assert.match(await check("/sitemap.xml", 200), /<urlset[\s>]/);
assert.match(await check("/robots.txt", 200), /Disallow: \//);
const health = JSON.parse(await check("/api/health", 200));
assert(health.ok === true || health.status === "ok", "The API health probe did not report ready");

await check("/admin", 404);
await check("/dashboard", 404);
await check("/api/account/workspace-access", 404);
assert.match(await check("/api/health", 405, "POST"), /accepts public reads only/i);
console.log("Cloudflare staging passed its public pages, API, static asset, and access checks.");
