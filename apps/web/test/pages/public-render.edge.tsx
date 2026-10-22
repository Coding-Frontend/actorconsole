// @vitest-environment node
import { expect, it } from "vitest";
import { renderPublicPage } from "../../src/edge/render";
import { documentationHtml } from "../../src/edge/prerender";

it("renders the existing blog view with published text, safely normalized nullable fields and no browser runtime", async () => {
  const html = await renderPublicPage(
    { kind: "blog", slug: "published-post" },
    {
      title: "Published article",
      slug: "published-post",
      content: "## A useful section\n\nThe complete published article.",
      tags: null,
      publishedAt: "2026-10-07T00:00:00Z",
    },
    "https://actorconsole.com/blog/published-post",
  );
  expect(html).toContain("Published article");
  expect(html).toContain("A useful section");
  expect(html).toContain("The complete published article.");
  expect(html).toContain("ActorConsole");
  expect(html.match(/class="marketing-content[^\"]*"/g)).toHaveLength(1);
  expect(html).toContain("home-grid-frame home-grid-footer");
});
it("renders the existing changelog article, including sanitized Markdown", async () => {
  const html = await renderPublicPage(
    { kind: "changelog", slug: "release" },
    {
      entry: {
        title: "Released today",
        slug: "release",
        text: "Summary",
        body: "## Feature\n\nFull release notes.\n\n<script>alert(1)</script>",
        tags: [],
        releaseDate: "2026-10-07",
        version: "1.0.0",
        category: "RELEASE",
        type: "FEATURE",
      },
      related: [],
    },
    "https://actorconsole.com/changelog/release",
  );
  expect(html).toContain("Released today");
  expect(html).toContain("Full release notes.");
  expect(html).not.toContain("<script>");
});
it("generates documentation content during the build without requesting an API", () => {
  const pages = documentationHtml(
    '<html><head><title>App</title></head><body><div id="root"></div></body></html>',
  );
  const page = pages.find((entry) => entry.path === "/docs/getting-started");
  expect(page?.html).toContain("Start with ActorConsole");
  expect(page?.html).toContain("Connect your Apify account");
  expect(page?.html).toContain('rel="canonical"');
  expect(page?.html.match(/class="marketing-content[^\"]*"/g)).toHaveLength(1);
  expect(page?.html).toContain("home-grid-frame home-grid-footer");
});
