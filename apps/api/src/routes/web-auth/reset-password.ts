import { JsonResponse } from "../../lib/http-context.js";
import { consumeAuthCode, db, hashPassword, isValidPassword, normalizeAuthEmail } from "@actorconsole/db";
import { getLogger } from "@actorconsole/shared";

const log = getLogger("api:reset-password");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; code?: string; password?: string };
    const email = normalizeAuthEmail(body.email ?? "");
    const code = body.code?.trim() ?? "";
    const password = body.password ?? "";
    if (!/^\d{6}$/.test(code) || !isValidPassword(password)) {
      return JsonResponse.json({ ok: false, error: "Enter a valid code and an 8–128 character password" }, { status: 400 });
    }
    const user = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!user || !(await consumeAuthCode(user.id, "RESET_PASSWORD", code))) {
      return JsonResponse.json({ ok: false, error: "Invalid or expired reset code" }, { status: 400 });
    }
    const passwordHash = await hashPassword(password);
    await db.$transaction([
      db.passwordCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, passwordHash },
        update: { passwordHash },
      }),
      db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } }),
      db.session.deleteMany({ where: { userId: user.id } }),
    ]);
    return JsonResponse.json({ ok: true });
  } catch (error) {
    log.error({ error }, "Password reset failed");
    return JsonResponse.json({ ok: false, error: "Unable to reset the password" }, { status: 500 });
  }
}
