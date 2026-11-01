import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  createPageMetadata,
  serializeJsonLd,
  SITE_URL,
  siteStructuredData,
} from "./seo";

describe("public search and sharing metadata", () => {
  it("does not repeat an existing brand name in documentation and CMS titles", () => {
    const meta = createPageMetadata({
      title: "Start with ActorConsole",
      description: "Setup guide",
      path: "/docs/getting-started",
    });
    expect(meta.title).toEqual({ absolute: "Start with ActorConsole" });
    expect(meta.openGraph?.title).toBe("Start with ActorConsole");
  });
  it("uses one branded title and a page-specific absolute canonical across platforms", () => {
    const meta = createPageMetadata({
      title: "Features",
      description: "Tools for Apify builders.",
      path: "/features",
      image: "features",
    });
    expect(meta.title).toEqual({ absolute: "Features · ActorConsole" });
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/features`);
    expect(meta.openGraph).toMatchObject({
      title: "Features · ActorConsole",
      description: meta.description,
      url: `${SITE_URL}/features`,
      siteName: "ActorConsole",
      type: "website",
      images: [
        { url: `${SITE_URL}/images/og/features.png`, width: 1200, height: 630, type: "image/png" },
      ],
    });
    expect(meta.twitter).toMatchObject({
      title: "Features · ActorConsole",
      description: meta.description,
      card: "summary_large_image",
      images: [{ url: `${SITE_URL}/images/og/features.png`, alt: "Features · ActorConsole" }],
    });
  });

  it("keeps article dates, tags, author, and a CMS cover without assuming its dimensions", () => {
    const meta = createPageMetadata({
      title: "A new workflow",
      description: "A product update.",
      path: "/blog/a-new-workflow",
      image: "blog",
      type: "article",
      coverImage: "/uploads/post.jpg",
      publishedTime: "2026-10-23T00:00:00Z",
      tags: ["Apify"],
      author: "ActorConsole team",
    });
    expect(meta.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-10-23T00:00:00Z",
      tags: ["Apify"],
      authors: ["ActorConsole team"],
      images: [{ url: absoluteUrl("/uploads/post.jpg") }],
    });
    expect(meta.openGraph?.images).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 1200 })]),
    );
  });

  it.each([null, "data:image/png;base64,broken", "javascript:alert(1)", "http://["])(
    "falls back to the branded image for an absent or invalid CMS cover: %s",
    (coverImage) => {
      const meta = createPageMetadata({
        title: "Blog",
        description: "Updates",
        path: "/blog",
        image: "blog",
        coverImage,
      });
      expect(meta.openGraph?.images).toEqual([
        expect.objectContaining({
          url: absoluteUrl("/images/og/blog.png"),
          width: 1200,
          height: 630,
        }),
      ]);
    },
  );

  it("provides share previews without indexing arbitrary comparison combinations", () => {
    const meta = createPageMetadata({
      title: "Compare builders",
      description: "A comparison",
      path: "/builders/compare/a/b",
      image: "compare",
      noIndex: true,
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.twitter).toHaveProperty("card", "summary_large_image");
  });

  it("uses the canonical origin in linked site identity data and safely embeds CMS text", () => {
    expect(siteStructuredData["@graph"][0]).toMatchObject({
      "@id": absoluteUrl("/#organization"),
      url: SITE_URL,
    });
    const encoded = serializeJsonLd({ headline: "</script><script>alert(1)</script>" });
    expect(encoded).not.toContain("<");
    expect(JSON.parse(encoded).headline).toBe("</script><script>alert(1)</script>");
  });

  it("ships all share images as compact, publicly served 1200×630 PNG files", () => {
    const directory = resolve(__dirname, "../../public/images/og");
    const images = readdirSync(directory).filter((name) => name.endsWith(".png"));
    expect(images).toHaveLength(18);
    for (const name of images) {
      const data = readFileSync(`${directory}/${name}`);
      expect(data.subarray(1, 4).toString()).toBe("PNG");
      expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([1200, 630]);
      expect(data.length).toBeLessThan(1_000_000);
    }
  });
});
