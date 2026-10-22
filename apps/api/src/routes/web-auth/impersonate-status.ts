import { JsonResponse } from "../../lib/http-context.js";
import { getMimicStatus } from "../../lib/impersonation.js";


export async function GET() {
  const status = await getMimicStatus();
  return JsonResponse.json({ ok: true, data: { active: Boolean(status), ...status } });
}
