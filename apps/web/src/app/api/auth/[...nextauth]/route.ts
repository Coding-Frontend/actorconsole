import { proxyApiRequest } from "@/lib/api-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(request: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  const { nextauth } = await context.params;
  return proxyApiRequest(request, ["auth", ...nextauth]);
}
export const GET = proxy;
export const POST = proxy;
