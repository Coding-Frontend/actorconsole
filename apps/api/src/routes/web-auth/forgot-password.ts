import { JsonResponse } from "../../lib/http-context.js";
import { db, issueAuthCode, normalizeAuthEmail } from "@actorconsole/db";
import { getLogger } from "@actorconsole/shared";
import { sendPasswordResetCode } from "../../lib/auth-email.js";

const log = getLogger("api:forgot-password");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = normalizeAuthEmail(body.email ?? "");
    const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
    if (user) {
      const { code } = await issueAuthCode(user.id, "RESET_PASSWORD");
      const delivery = await sendPasswordResetCode(email, user.name, code);
      if (!delivery.ok) log.error({ userId: user.id, error: delivery.error }, "Password reset email failed");
    }
    return JsonResponse.json({ ok: true });
  } catch (error) {
    if (!(error instanceof Error && error.message === "AUTH_CODE_RATE_LIMITED")) {
      log.error({ error }, "Password reset request failed");
    }
    return JsonResponse.json({ ok: true });
  }
}
