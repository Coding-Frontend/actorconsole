import { expect, test } from "@playwright/test";

test("sitemap discovers published blog and older changelog articles without draft/deleted URLs", async ({
  request,
}) => {
  const suffix = process.env.E2E_CONTENT_SUFFIX;
  if (!suffix)
    throw new Error(
      "Sitemap launch check requires isolated seeded content. Run pnpm test:e2e:launch.",
    );
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const xml = await response.text();
  for (const kind of ["blog", "changelog"]) {
    const slug = `e2e-published-${kind}-${suffix}`;
    expect(xml).toContain(`/${kind}/${slug}</loc>`);
    expect(xml).not.toContain(`e2e-draft-${kind}-${suffix}`);
    const article = await request.get(`/${kind}/${slug}`);
    expect(article.ok()).toBe(true);
    const head = (await article.text()).split("</head>")[0];
    expect(head).toContain(`/${kind}/${slug}`);
    expect(head).toContain('property="og:type" content="article"');
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
  }
  expect(xml).not.toContain(`e2e-deleted-blog-${suffix}`);
});
