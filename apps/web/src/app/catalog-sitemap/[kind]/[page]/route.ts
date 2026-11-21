import { SERVER_API_BASE_URL } from "@/lib/api-base";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; page: string }> },
) {
  const { kind, page } = await params;
  if ((kind !== "builders" && kind !== "actors") || !/^[1-9]\d{0,5}$/.test(page)) {
    return new Response(null, { status: 404 });
  }
  try {
    const response = await fetch(`${SERVER_API_BASE_URL}/public/sitemap/catalog/${kind}/${page}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return new Response(null, { status: 404 });
    if (response.ok && response.headers.get("content-type")?.startsWith("application/xml")) {
      return new Response(response.body, {
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "public, max-age=300, s-maxage=300",
        },
      });
    }
  } catch {
    // The next crawl can retry a temporary API failure.
  }
  return new Response(null, {
    status: 503,
    headers: { "cache-control": "no-store", "retry-after": "300" },
  });
}
