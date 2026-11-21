import { contentSitemapEntries } from "./content-sitemap";

const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function sitemapXml(element: "sitemapindex" | "urlset", entries: string[]) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<${element} xmlns="${namespace}">\n${entries.join("\n")}\n</${element}>\n`,
    {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}

export function sitemapLocation(url: string) {
  return `<loc>${escapeXml(url)}</loc>`;
}

export async function contentSitemapXml() {
  const entries = await contentSitemapEntries();
  return sitemapXml(
    "urlset",
    entries.map(({ url, lastModified, changeFrequency, priority }) => {
      const date = lastModified instanceof Date ? lastModified.toISOString() : lastModified;
      return (
        `<url>${sitemapLocation(url)}` +
        (date ? `<lastmod>${escapeXml(date)}</lastmod>` : "") +
        (changeFrequency ? `<changefreq>${changeFrequency}</changefreq>` : "") +
        (priority === undefined ? "" : `<priority>${priority}</priority>`) +
        "</url>"
      );
    }),
  );
}
