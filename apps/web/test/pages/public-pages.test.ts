// @vitest-environment node
import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { publicPageRoute, servePublicPage } from "../../../../.deploy/pages/public-pages.js";
import { publicDocument } from "../../../../.deploy/pages/public-document.js";
import { decodeApiData } from "@actorconsole/shared/api-data";

const template =
  '<!doctype html><html><head><title>Old title</title><meta name="description" content="old"/></head><body><div id="root"></div><script type="module" src="/assets/index-test.js"></script></body></html>';
const request = (path: string, init?: RequestInit) =>
  new Request(`http://localhost:8080${path}`, init);
function setup(
  data: unknown = { title: "Published post", slug: "published-post", content: "Content" },
) {
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: Request) => entries.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, response: Response) => {
      entries.set(key.url, response);
    }),
  };
  const waiting: Promise<unknown>[] = [];
  const context = { waitUntil: (promise: Promise<unknown>) => waiting.push(promise) };
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ ok: true, data }));
  const render = vi.fn(async () => "<article><h1>Published post</h1><p>Content</p></article>");
  return {
    options: {
      template,
      buildId: "release1",
      render,
      decode: decodeApiData,
      cache,
      context,
      fetcher,
    },
    waiting,
  };
}

it("keeps dashboard, auth, static assets, sitemap, listings and comparisons outside Worker invocation", () => {
  const routes = JSON.parse(
    readFileSync(new URL("../../../../.deploy/pages/_routes.json", import.meta.url), "utf8"),
  );
  const match = (pattern: string, path: string) =>
    pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
  const invoked = (path: string) =>
    routes.include.some((pattern: string) => match(pattern, path)) &&
    !routes.exclude.some((pattern: string) => match(pattern, path));
  for (const path of [
    "/",
    "/features",
    "/pricing",
    "/faq",
    "/legal/terms",
    "/docs/getting-started",
    "/dashboard/actors",
    "/admin/blog",
    "/login",
    "/api/auth/session",
    "/assets/index.js",
    "/sitemap.xml",
    "/builders",
    "/research",
    "/blog",
    "/changelog",
    "/actors/compare/a/b",
    "/builders/compare",
    "/builders/compare/a/b",
    "/changelog/feed",
  ])
    expect(invoked(path), path).toBe(false);
  for (const path of [
    "/builders/alice",
    "/builders/alice/actors/scraper",
    "/blog/published-post",
    "/changelog/new-release",
    "/api/extension-device/me",
  ])
    expect(invoked(path), path).toBe(true);
});
it.each([
  "/builders/compare",
  "/builders/alice/extra",
  "/builders/%2fadmin",
  "/builders/%ZZ",
  "/blog/foo/bar",
  "/changelog/feed",
])("does not accept %s as a public detail page", (path) =>
  expect(publicPageRoute(path)).toBeNull(),
);
it("shares cached anonymous HTML across tracking queries and callers, with no credentials forwarded", async () => {
  const { options, waiting } = setup();
  const first = await servePublicPage(
    request("/blog/published-post?utm_source=one", {
      headers: { cookie: "private=alice", authorization: "Bearer private" },
    }),
    options,
  );
  expect(first.status).toBe(200);
  expect(await first.text()).toContain("<h1>Published post</h1>");
  await Promise.all(waiting);
  const second = await servePublicPage(
    request("/blog/published-post?utm_source=two", { headers: { cookie: "private=bob" } }),
    options,
  );
  expect(second.status).toBe(200);
  expect(options.fetcher).toHaveBeenCalledTimes(1);
  expect(options.render).toHaveBeenCalledTimes(1);
  expect(options.fetcher.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  expect(second.headers.get("set-cookie")).toBeNull();
  expect(second.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60");
});
it("invalidates HTML when the deployed frontend changes", async () => {
  const { options, waiting } = setup();
  await servePublicPage(request("/blog/published-post"), options);
  await Promise.all(waiting);
  expect(
    (await servePublicPage(request("/blog/published-post"), { ...options, buildId: "release2" }))
      .status,
  ).toBe(200);
  expect(options.fetcher).toHaveBeenCalledTimes(2);
});
it("avoids origin reads and cache entries for portfolio filters", async () => {
  const { options } = setup();
  const response = await servePublicPage(
    request("/builders/alice?actorQ=expensive&actorPage=99"),
    options,
  );
  expect(response.status).toBe(200);
  expect(options.fetcher).not.toHaveBeenCalled();
  expect(options.cache.put).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("renders default portfolio windows and ignores unrelated article query parameters", async () => {
  const { options } = setup();
  expect((await servePublicPage(request("/blog/published-post?window=90"), options)).status).toBe(
    200,
  );
  expect(options.render).toHaveBeenCalledTimes(1);
});
it.each(["null", "missing", "unavailable", "html", "invalid"])(
  "returns the right uncached status for %s public data",
  async (failure) => {
    const { options } = setup(null);
    if (failure === "missing")
      options.fetcher.mockResolvedValue(new Response(null, { status: 404 }));
    if (failure === "unavailable") options.fetcher.mockRejectedValue(new Error("offline"));
    if (failure === "html") options.fetcher.mockResolvedValue(new Response("<html>gateway</html>"));
    if (failure === "invalid") options.fetcher.mockResolvedValue(Response.json({ ok: false }));
    const response = await servePublicPage(request("/blog/missing"), options);
    expect(response.status).toBe(["null", "missing"].includes(failure) ? 404 : 503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(options.cache.put).not.toHaveBeenCalled();
  },
);
it("supports HEAD without a body and refuses mutations before any origin read", async () => {
  const { options } = setup();
  const head = await servePublicPage(request("/blog/published-post", { method: "HEAD" }), options);
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  options.fetcher.mockClear();
  const post = await servePublicPage(request("/blog/published-post", { method: "POST" }), options);
  expect(post.status).toBe(405);
  expect(options.fetcher).not.toHaveBeenCalled();
});
it("replaces existing page metadata and safely embeds untrusted API text and JSON", () => {
  const original = publicDocument(template, { path: "/", title: "Home" });
  const html = publicDocument(
    original,
    {
      path: "/blog/safe",
      title: '<script>alert("x")</script>',
      description: '"/><script>evil</script>',
    },
    { content: "<article>Safe HTML</article>", seed: { value: "</script><script>evil</script>" } },
  );
  expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  expect(html.match(/property="og:title"/g)).toHaveLength(1);
  expect(html).not.toContain('<script>alert("x")');
  expect(html).not.toContain("</script><script>evil");
  expect(html).toContain("\\u003c/script>");
  expect(html).toContain("/assets/index-test.js");
});
