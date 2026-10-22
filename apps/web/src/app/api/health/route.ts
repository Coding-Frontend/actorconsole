import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok", service: "web", revision: process.env.GIT_SHA ?? "unknown" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
