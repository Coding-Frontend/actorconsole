import { NextResponse } from "next/server";
import {
  loadPublicComparison,
  parseComparisonIds,
  parseComparisonWindow,
} from "@/lib/public-comparison";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") === "actor" ? "actor" : "builder";
  const ids = parseComparisonIds(params.getAll("item"));
  if (!ids.length) return NextResponse.json({ items: [], missing: 0 });
  try {
    const data = await loadPublicComparison(kind, ids, parseComparisonWindow(params.get("window")));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch {
    return NextResponse.json(
      { error: "Comparison details are unavailable. Try again." },
      { status: 503 },
    );
  }
}
