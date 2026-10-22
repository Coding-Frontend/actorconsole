import { NextResponse } from "next/server";
import { parseComparisonWindow, searchPublicComparison } from "@/lib/public-comparison";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") === "actor" ? "actor" : "builder";
  const query = params.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) return NextResponse.json({ items: [] });
  try {
    const items = await searchPublicComparison(
      kind,
      query,
      parseComparisonWindow(params.get("window")),
    );
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } },
    );
  } catch {
    return NextResponse.json({ error: "Search is unavailable. Try again." }, { status: 503 });
  }
}
