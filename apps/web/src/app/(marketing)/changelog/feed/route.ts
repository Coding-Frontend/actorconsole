import { getChangelogFeed } from "@/services/changelog";
import { changelogFeed } from "@/lib/changelog-feed";

export const revalidate = 60;
export async function GET() {
  try {
    const items = await getChangelogFeed();
    return new Response(
      changelogFeed(items, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8080"),
      {
        headers: {
          "Content-Type": "application/rss+xml; charset=utf-8",
          "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch {
    return new Response("Changelog feed temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
