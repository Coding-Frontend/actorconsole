import { SERVER_API_BASE_URL } from "@/lib/api-base";
import { absoluteUrl } from "@/lib/seo";
import { contentSitemapXml, sitemapLocation, sitemapXml } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

const kinds = ["builders", "actors"] as const;

export async function GET() {
  try {
    const response = await fetch(`${SERVER_API_BASE_URL}/public/sitemap/catalog`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5_000),
    });
    // Pages can deploy before the API. Keep the existing sitemap available
    // until the catalog route is deployed.
    if (response.status === 404) return contentSitemapXml();
    if (response.ok) {
      const { data } = (await response.json()) as { data?: Record<(typeof kinds)[number], number> };
      if (
        data &&
        kinds.every((kind) => Number.isSafeInteger(data[kind]) && data[kind] >= 0) &&
        data.builders + data.actors < 50_000
      ) {
        const paths = ["/sitemap-content.xml"];
        for (const kind of kinds) {
          for (let page = 1; page <= data[kind]; page++) {
            paths.push(`/sitemap-${kind}-${page}.xml`);
          }
        }
        return sitemapXml(
          "sitemapindex",
          paths.map((path) => `<sitemap>${sitemapLocation(absoluteUrl(path))}</sitemap>`),
        );
      }
    }
  } catch {
    // Return a retryable failure instead of temporarily dropping catalog links.
  }
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "cache-control": "no-store", "retry-after": "300" },
  });
}
