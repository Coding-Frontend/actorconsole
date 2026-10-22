import { JsonResponse } from "../../lib/http-context.js";
import { consumeAuthCode, db, normalizeAuthEmail } from "@actorconsole/db";
import { getLogger } from "@actorconsole/shared";
import { authUserSelect, completeUserLogin } from "../../lib/server-session.js";

const log = getLogger("api:verify-email");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; code?: string };
    const email = normalizeAuthEmail(body.email ?? "");
    const user = await db.user.findUnique({ where: { email }, select: authUserSelect });
    if (!user || !body.code || !/^\d{6}$/.test(body.code)) {
      return JsonResponse.json({ ok: false, error: "Invalid or expired verification code" }, { status: 400 });
    }
    if (user.emailVerified) {
      return JsonResponse.json(
        { ok: false, error: "Email is already verified. Sign in to continue." },
        { status: 409 },
      );
    }
    const valid = await consumeAuthCode(user.id, "VERIFY_EMAIL", body.code);
    if (!valid) {
      return JsonResponse.json({ ok: false, error: "Invalid or expired verification code" }, { status: 400 });
    }
    user.emailVerified = new Date();
    await db.user.update({ where: { id: user.id }, data: { emailVerified: user.emailVerified } });
    return completeUserLogin(req, user);
  } catch (error) {
    log.error({ error }, "Email verification failed");
    return JsonResponse.json({ ok: false, error: "Unable to verify the email" }, { status: 500 });
  }
}
