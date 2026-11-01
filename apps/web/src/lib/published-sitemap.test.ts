import { afterEach, describe, expect, it, vi } from "vitest";
import { publishedSitemapEntries } from "./published-sitemap";
import { absoluteUrl } from "./seo";
afterEach(() => vi.unstubAllGlobals());
describe("published article sitemap", () => {
  it("collects all pages, encodes slugs, deduplicates URLs, and preserves actual modification dates", async () => {
    const fetcher = vi.fn(async (input: URL) => {
      const cursor = input.searchParams.get("cursor");
      const blog = input.pathname.endsWith("/blog");
      return Response.json({
        ok: true,
        data: {
          items: [
            {
              slug: blog ? (cursor ? "second post" : "first-post") : "older-release",
              updatedAt: blog ? "2026-10-23T00:00:00Z" : "2025-01-01T00:00:00Z",
            },
          ],
          nextCursor: blog && !cursor ? "page-2" : null,
        },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const entries = await publishedSitemapEntries();
    expect(entries.map((entry) => entry.url)).toEqual([
      absoluteUrl("/blog/first-post"),
      absoluteUrl("/blog/second%20post"),
      absoluteUrl("/changelog/older-release"),
    ]);
    expect(entries[2].lastModified).toEqual(new Date("2025-01-01T00:00:00Z"));
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("keeps the healthy feed when the other API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) =>
        url.pathname.endsWith("/blog")
          ? new Response(null, { status: 503 })
          : Response.json({
              ok: true,
              data: { items: [{ slug: "release", updatedAt: "invalid" }], nextCursor: null },
            }),
      ),
    );
    const entries = await publishedSitemapEntries();
    expect(entries).toEqual([expect.objectContaining({ url: absoluteUrl("/changelog/release") })]);
    expect(entries[0].lastModified).toBeUndefined();
  });
  it("stops malformed repeated-cursor feeds without hanging the sitemap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, data: { items: [], nextCursor: "repeated" } })),
    );
    expect(await publishedSitemapEntries()).toEqual([]);
  });
});
