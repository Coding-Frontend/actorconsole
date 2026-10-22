import { afterEach, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { installInitialPublicRead, PublicHtmlMetadata } from "./public-html";
import { NavigationContext } from "./navigation";
import { API_BASE_URL } from "./api-base";
import { publicApiPath, publicPageRoute } from "../../../../.deploy/pages/public-pages.js";
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
it("reuses the embedded read but never intercepts an account read or mutation", async () => {
  window.history.replaceState({}, "", "/blog/published-post");
  const apiPath = publicApiPath(publicPageRoute("/blog/published-post"));
  const payload = { ok: true, data: { title: "Published post" } };
  document.body.innerHTML = `<script id="ac-public-read" type="application/json">${JSON.stringify({ path: "/blog/published-post", apiPath, payload, expires: Date.now() + 60_000 })}</script>`;
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  installInitialPublicRead();
  expect(await (await window.fetch(new URL(apiPath, `${API_BASE_URL}/`).href)).json()).toEqual(
    payload,
  );
  expect(fetcher).not.toHaveBeenCalled();
  await window.fetch(new URL(apiPath, `${API_BASE_URL}/`).href, { method: "POST" });
  await window.fetch(new URL("/account/profile", `${API_BASE_URL}/`).href);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("refreshes canonical and sharing tags during navigation and marks private routes noindex", () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://selfhost.example");
  document.head.innerHTML =
    '<title>Article</title><meta name="description" content="Article description"/><meta property="og:image" content="https://example.com/article.png"/><link rel="canonical" href="https://selfhost.example/blog/old"/>';
  const view = render(
    <NavigationContext.Provider
      value={{ pathname: "/docs/getting-started", search: "", version: 0, params: {} }}
    >
      <PublicHtmlMetadata />
    </NavigationContext.Provider>,
  );
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
    "https://selfhost.example/docs/getting-started",
  );
  expect(document.querySelector('meta[property="og:image"]')).toBeNull();
  view.rerender(
    <NavigationContext.Provider
      value={{ pathname: "/dashboard", search: "", version: 1, params: {} }}
    >
      <PublicHtmlMetadata />
    </NavigationContext.Provider>,
  );
  expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
    "noindex, nofollow",
  );
});
it("preserves the initial noindex policy for a missing public record", () => {
  document.head.innerHTML =
    '<title>Page not found</title><meta name="robots" content="noindex, nofollow"/>';
  render(
    <NavigationContext.Provider
      value={{ pathname: "/blog/missing", search: "", version: 0, params: {} }}
    >
      <PublicHtmlMetadata />
    </NavigationContext.Provider>,
  );
  expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
    "noindex, nofollow",
  );
});
