import { JsonResponse } from "../../lib/http-context.js";
import { db, normalizeAuthEmail, verifyPassword } from "@actorconsole/db";
import { getLogger } from "@actorconsole/shared";
import { authUserSelect, completeUserLogin, recordLoginEvent } from "../../lib/server-session.js";

const log = getLogger("api:local-login");
const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$YWN0b3Jjb25zb2xlLWR1bW15LWxvZ2luLXYx$axuo2lgNwfenRZIABvcHxIdY_UBzGuR2di-dSlx97apJTxfvOEfNfThATjOIursg17FzCZ168paEsEH-lJQvtQ";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      totpCode?: string;
      challengeToken?: string;
    };
    const email = normalizeAuthEmail(body.email ?? "");
    const password = body.password ?? "";
    const user = await db.user.findUnique({
      where: { email },
      select: {
        ...authUserSelect,
        passwordCredential: { select: { passwordHash: true } },
      },
    });

    if (user) {
      const recentFailures = await db.loginEvent.count({
        where: {
          userId: user.id,
          success: false,
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
      });
      if (recentFailures >= 10) {
        return JsonResponse.json(
          { ok: false, error: "Too many attempts. Try again in 15 minutes." },
          { status: 429 },
        );
      }
    }

    const valid = await verifyPassword(
      password,
      user?.passwordCredential?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !user.passwordCredential || !valid) {
      if (user) await recordLoginEvent(req, user.id, false);
      return JsonResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
    }
    if (!user.emailVerified) {
      return JsonResponse.json(
        { ok: false, error: "Verify your email before signing in", code: "EMAIL_UNVERIFIED" },
        { status: 403 },
      );
    }

    const { passwordCredential: _credential, ...authUser } = user;
    return completeUserLogin(req, authUser, {
      totpCode: body.totpCode,
      challengeToken: body.challengeToken,
    });
  } catch (error) {
    log.error({ error }, "Local sign-in failed");
    return JsonResponse.json({ ok: false, error: "Unable to sign in" }, { status: 500 });
  }
}
