import { JsonResponse } from "../../lib/http-context.js";
import { db, hashPassword, isValidAuthEmail, isValidPassword, issueAuthCode, normalizeAuthEmail } from "@actorconsole/db";
import { getLogger } from "@actorconsole/shared";
import { sendVerificationCode, sendRegistrationGuidance } from "../../lib/auth-email.js";

const log = getLogger("api:local-register");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string; termsAccepted?: boolean };
    const email = normalizeAuthEmail(body.email ?? "");
    const password = body.password ?? "";
    if (!isValidAuthEmail(email) || !isValidPassword(password) || body.termsAccepted !== true) {
      return JsonResponse.json(
        { ok: false, error: "Enter a valid email, an 8–128 character password, and accept the policies" },
        { status: 400 },
      );
    }

    // Equalize the expensive step even when the address is already registered.
    const [passwordHash, existing, terms, privacy] = await Promise.all([hashPassword(password), db.user.findUnique({
      where: { email },
      select: { id: true, passwordCredential: { select: { userId: true } } },
    }),
      db.policy.findFirst({ where: { slug: "TERMS", status: "PUBLISHED" }, orderBy: { publishedAt: "desc" } }),
      db.policy.findFirst({ where: { slug: "PRIVACY", status: "PUBLISHED" }, orderBy: { publishedAt: "desc" } }),
    ]);
    if (existing) {
      await sendRegistrationGuidance(email);
      return JsonResponse.json({ ok: true });
    }
    const user = await db.user.create({
      data: {
        email,
        name: email.split("@")[0] ?? null,
        termsAcceptedAt: terms ? new Date() : null,
        termsVersion: terms?.version ?? null,
        privacyAcceptedAt: privacy ? new Date() : null,
        privacyVersion: privacy?.version ?? null,
        passwordCredential: { create: { passwordHash } },
      },
      select: { id: true, name: true },
    });
    const { code } = await issueAuthCode(user.id, "VERIFY_EMAIL");
    const delivery = await sendVerificationCode(email, user.name, code);
    if (!delivery.ok) {
      log.error({ userId: user.id, error: delivery.error }, "Verification email could not be sent");
    }
    return JsonResponse.json({ ok: true });
  } catch (error) {
    // Concurrent duplicate requests and mail/code delivery outages must not
    // become an account-existence oracle either.
    if ((error as { code?: string }).code === "P2002" ||
        (error instanceof Error && error.message === "AUTH_CODE_RATE_LIMITED")) {
      return JsonResponse.json({ ok: true });
    }
    log.error({ error }, "Local registration failed");
    return JsonResponse.json({ ok: true });
  }
}
