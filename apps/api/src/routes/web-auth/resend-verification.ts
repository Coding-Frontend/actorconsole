import { JsonResponse } from "../../lib/http-context.js";
import { db, issueAuthCode, normalizeAuthEmail } from "@actorconsole/db";
import { getLogger } from "@actorconsole/shared";
import { sendVerificationCode } from "../../lib/auth-email.js";

const log = getLogger("api:resend-verification");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = normalizeAuthEmail(body.email ?? "");
    const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, emailVerified: true } });
    if (!user || user.emailVerified) return JsonResponse.json({ ok: true });
    const { code } = await issueAuthCode(user.id, "VERIFY_EMAIL");
    const delivery = await sendVerificationCode(email, user.name, code);
    return delivery.ok
      ? JsonResponse.json({ ok: true })
      : JsonResponse.json({ ok: false, error: "Verification email is not configured" }, { status: 503 });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_CODE_RATE_LIMITED") {
      return JsonResponse.json({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });
    }
    log.error({ error }, "Verification code resend failed");
    return JsonResponse.json({ ok: false, error: "Unable to send a verification code" }, { status: 500 });
  }
}
