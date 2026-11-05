import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMetadata as blogMetadata } from "@/app/(marketing)/blog/[slug]/view";
import { generateMetadata as changelogMetadata } from "@/app/(marketing)/changelog/[slug]/view";
import { generateMetadata as guideMetadata } from "@/app/(marketing)/docs/[slug]/page";
import { generateMetadata as builderComparisonMetadata } from "@/app/(marketing)/builders/compare/[...selection]/page";
import { generateMetadata as actorComparisonMetadata } from "@/app/(marketing)/actors/compare/[...selection]/page";
import { getChangelogArticle } from "@/services/changelog";
import { absoluteUrl } from "@/lib/seo";
import { generateMetadata as policyMetadata } from "@/app/(marketing)/legal/[slug]/page";

vi.mock("@/services/changelog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/changelog")>()),
  getChangelogArticle: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("public route metadata", () => {
  it.each([false, true])(
    "indexes a legal page only when its policy is published: %s",
    async (published) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          published
            ? Response.json({
                data: {
                  title: "Terms",
                  body: "Published terms",
                  version: "1",
                  publishedAt: "2026-10-23T00:00:00Z",
                },
              })
            : new Response(null, { status: 404 }),
        ),
      );
      const metadata = await policyMetadata({ params: Promise.resolve({ slug: "terms" }) });
      expect(metadata.robots).toEqual(published ? undefined : { index: false, follow: false });
    },
  );
  it("shares a published blog post with its CMS SEO copy, cover, and article date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          data: {
            slug: "new-workflow",
            title: "A new workflow",
            seoTitle: "Publishing workflows",
            seoDescription: "Review and publish your Actors.",
            coverImage: "https://images.example.com/cover.jpg",
            publishedAt: "2026-10-23T00:00:00Z",
            updatedAt: "2026-11-05T00:00:00Z",
            author: { name: "Editorial team" },
            tags: ["Publishing"],
          },
        }),
      ),
    );
    const meta = await blogMetadata({ params: Promise.resolve({ slug: "new-workflow" }) });
    expect(meta.title).toEqual({ absolute: "Publishing workflows · ActorConsole" });
    expect(meta.alternates?.canonical).toBe(absoluteUrl("/blog/new-workflow"));
    expect(meta.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-10-23T00:00:00Z",
      modifiedTime: "2026-11-05T00:00:00Z",
      images: [{ url: "https://images.example.com/cover.jpg" }],
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      description: "Review and publish your Actors.",
    });
  });

  it("does not index a missing post or publish a fake article preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const meta = await blogMetadata({ params: Promise.resolve({ slug: "missing" }) });
    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.openGraph).toBeUndefined();
  });

  it("gives a changelog article a large card and branded fallback image", async () => {
    vi.mocked(getChangelogArticle).mockResolvedValue({
      entry: {
        title: "Better publishing",
        slug: "better-publishing",
        text: "Review publishing updates.",
        releaseDate: "2026-10-23",
        tags: ["Publishing"],
      },
      related: [],
    } as never);
    const meta = await changelogMetadata({
      params: Promise.resolve({ slug: "better-publishing" }),
    });
    expect(meta.alternates?.canonical).toBe(absoluteUrl("/changelog/better-publishing"));
    expect(meta.openGraph).toMatchObject({
      type: "article",
      images: [{ url: absoluteUrl("/images/og/changelog.png") }],
    });
    expect(meta.twitter).toHaveProperty("card", "summary_large_image");
  });

  it("gives documentation its own canonical and avoids repeating the brand", async () => {
    const meta = await guideMetadata({ params: Promise.resolve({ slug: "getting-started" }) });
    expect(meta.title).toEqual({ absolute: "Start with ActorConsole" });
    expect(meta.alternates?.canonical).toBe(absoluteUrl("/docs"));
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({ url: absoluteUrl("/images/og/docs.png") }),
    ]);
  });

  it("shares the selected builders and Actors while excluding comparison permutations from search", async () => {
    const builders = await builderComparisonMetadata({
      params: Promise.resolve({ selection: ["alice", "bob"] }),
    });
    const actors = await actorComparisonMetadata({
      params: Promise.resolve({ selection: ["alice", "scraper", "~bob", "crawler"] }),
    });
    expect(builders.title).toEqual({ absolute: "Compare alice vs bob · ActorConsole" });
    expect(builders.alternates?.canonical).toBe(absoluteUrl("/builders/compare/alice/bob"));
    expect(actors.alternates?.canonical).toBe(
      absoluteUrl("/actors/compare/alice/scraper/~bob/crawler"),
    );
    expect(builders.robots).toMatchObject({ index: false });
    expect(actors.robots).toMatchObject({ index: false });
  });
});
