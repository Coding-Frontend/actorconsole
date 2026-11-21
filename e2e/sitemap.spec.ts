import { expect, test } from "@playwright/test";

test("sitemap discovers published blog and older changelog articles without draft/deleted URLs", async ({
  request,
}) => {
  const suffix = process.env.E2E_CONTENT_SUFFIX;
  if (!suffix)
    throw new Error(
      "Sitemap launch check requires isolated seeded content. Run pnpm test:e2e:launch.",
    );
  const response = await request.get("/sitemap-content.xml");
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

test("sitemap index discovers canonical public builder and Actor URLs", async ({ request }) => {
  const suffix = process.env.E2E_CONTENT_SUFFIX;
  expect(suffix).toBeTruthy();
  const username = `e2e-catalog-${suffix}`;
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const index = await response.text();
  expect(index).toContain("<sitemapindex");
  expect(index).toContain("/sitemap-content.xml</loc>");
  expect(index).toContain("/sitemap-builders-1.xml</loc>");
  expect(index).toContain("/sitemap-actors-1.xml</loc>");

  const [builders, actors] = await Promise.all([
    request.get("/sitemap-builders-1.xml"),
    request.get("/sitemap-actors-1.xml"),
  ]);
  expect(builders.ok()).toBe(true);
  expect(actors.ok()).toBe(true);
  expect(actors.headers()["content-type"]).toContain("application/xml");
  const buildersXml = await builders.text();
  const actorsXml = await actors.text();
  expect(buildersXml).toContain(`/builders/${username}</loc>`);
  expect(buildersXml).not.toContain(`placeholder-${suffix}`);
  expect(actorsXml).toContain(`/builders/${username}/actors/public-actor</loc>`);
  expect(actorsXml).not.toContain(`/builders/${username}/actors/private-actor`);
  expect(actorsXml).not.toContain(`/builders/${username}/actors/retired-actor`);
  expect(actorsXml).not.toContain(`placeholder-${suffix}`);
  expect((await request.get("/sitemap-actors-999999.xml")).status()).toBe(404);
});
