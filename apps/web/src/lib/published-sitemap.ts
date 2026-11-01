import type { MetadataRoute } from "next";
import { getLogger } from "@actorconsole/shared";
import { SERVER_API_BASE_URL } from "./api-base";
import { absoluteUrl } from "./seo";

type ContentKind = "blog" | "changelog";
type Feed = { items: Array<{ slug: string; updatedAt: string }>; nextCursor: string | null };
const log = getLogger("web:sitemap");

async function contentEntries(kind: ContentKind): Promise<MetadataRoute.Sitemap> {
  const entries = new Map<string, MetadataRoute.Sitemap[number]>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const url = new URL(`${SERVER_API_BASE_URL}/public/sitemap/${kind}`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Sitemap ${kind} feed returned ${response.status}`);
    const body = (await response.json()) as { ok: boolean; data: Feed };
    if (!body.ok || !Array.isArray(body.data?.items))
      throw new Error(`Invalid ${kind} sitemap feed`);
    for (const item of body.data.items) {
      if (typeof item.slug !== "string" || !item.slug.trim()) continue;
      const url = absoluteUrl(`/${kind}/${encodeURIComponent(item.slug)}`);
      const date = new Date(item.updatedAt);
      entries.set(url, {
        url,
        ...(Number.isNaN(date.getTime()) ? {} : { lastModified: date }),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
    cursor = body.data.nextCursor;
    if (cursor !== null && (typeof cursor !== "string" || seenCursors.has(cursor))) {
      throw new Error(`Invalid ${kind} sitemap pagination cursor`);
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return [...entries.values()];
}

export async function publishedSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const kinds = ["blog", "changelog"] as const;
  const results = await Promise.allSettled(kinds.map(contentEntries));
  return results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    // Keep the static sitemap and the healthy feed available during an API outage.
    // No development fixtures or unpublished article URLs enter the sitemap.
    log.warn({ error: result.reason, kind: kinds[index] }, "Published sitemap feed unavailable");
    return [];
  });
}
