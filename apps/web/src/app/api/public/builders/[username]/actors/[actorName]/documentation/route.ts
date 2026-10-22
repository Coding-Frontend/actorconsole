import { proxyApiRequest } from "@/lib/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ username: string; actorName: string }> }) {
  const params = await context.params;
  return proxyApiRequest(request, ["public", "builders", params.username, "actors", params.actorName, "documentation"]);
}
