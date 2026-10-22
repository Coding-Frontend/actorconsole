import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { publicDocument, PUBLIC_SITE, escapeHtml } from "../.deploy/pages/public-document.js";
import { PUBLIC_API_ORIGIN } from "../.deploy/pages/public-config.js";

export function writeStaticPublicHtml(output, documentationHtml) {
  const template = readFileSync(join(output, "index.html"), "utf8");
  const metadata = JSON.parse(readFileSync(join(output, "public-metadata.json"), "utf8"));
  const pages = metadata.map((item) => ({ path: item.path, html: publicDocument(template, item) }));
  pages.push(...documentationHtml(template));
  const staticPaths = new Set();
  for (const { path, html } of pages) {
    if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/.test(path))
      throw new Error("Invalid static page path");
    const file = join(output, path === "/" ? "index.html" : `${path.slice(1)}.html`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
    staticPaths.add(path);
  }
  return staticPaths;
}

/** CMS URLs are assembled once per release, never by a sitemap Worker. */
export async function addPublishedSitemapUrls(output, fetcher = fetch) {
  const urls = new Set();
  const load = async (path) => {
    const response = await fetcher(`${PUBLIC_API_ORIGIN}${path}`, {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      throw new Error(`Sitemap API unavailable (${response.status})`);
    const body = await response.json();
    if (body.ok !== true) throw new Error("Invalid sitemap data");
    return body;
  };
  for (const kind of ["blog", "changelog"]) {
    for (let page = 1; page <= 1_000; page++) {
      const body = await load(
        kind === "blog"
          ? `/blog?page=${page}&limit=50`
          : `/changelog/entries?page=${page}&limit=100`,
      );
      const items = kind === "blog" ? body.data : body.data.items;
      if (!Array.isArray(items)) throw new Error("Invalid sitemap listing");
      for (const item of items) {
        if (
          typeof item.slug !== "string" ||
          item.slug.length > 200 ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)
        )
          throw new Error("Invalid public article slug");
        urls.add(`${PUBLIC_SITE}/${kind}/${item.slug}`);
      }
      const totalPages =
        kind === "blog"
          ? body.pagination?.totalPages
          : Math.ceil(body.data.total / body.data.limit);
      if (!Number.isFinite(totalPages)) throw new Error("Invalid sitemap pagination");
      if (page >= totalPages) break;
      if (page === 1_000) throw new Error("Sitemap exceeds the release pagination limit");
    }
  }
  if (urls.size > 49_000) throw new Error("A sitemap index is needed for this publication volume");
  const file = join(output, "sitemap.xml");
  const extra = [...urls]
    .map(
      (url) =>
        `<url><loc>${escapeHtml(url)}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
    )
    .join("");
  writeFileSync(file, readFileSync(file, "utf8").replace("</urlset>", `${extra}</urlset>`));
  return urls.size;
}
