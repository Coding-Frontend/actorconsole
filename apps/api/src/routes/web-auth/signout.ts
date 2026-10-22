import { JsonResponse } from "../../lib/http-context.js";
import { requestCookies } from "../../lib/http-context.js";
import { getLogger } from "@actorconsole/shared";

const log = getLogger("api:auth");

// Sign-out deletes the database session through Prisma.

/**
 * POST /api/auth/signout
 *
 * Clears the compatible session cookies and deletes the session from the DB.
 * The client should also call Firebase signOut() before hitting this route.
 */
export async function POST() {
  try {
    const cookieStore = await requestCookies();
    const sessionToken =
      cookieStore.get("__Secure-authjs.session-token")?.value ??
      cookieStore.get("authjs.session-token")?.value;

    if (sessionToken) {
      // Delete session from DB
      const { db } = await import("@actorconsole/db");
      await db.session.deleteMany({ where: { sessionToken } });
    }

    // Clear the cookie
    cookieStore.delete("authjs.session-token");
    cookieStore.delete("__Secure-authjs.session-token");

    return JsonResponse.json({ ok: true });
  } catch (err: unknown) {
    log.error({ err }, "Sign-out failed");
    return JsonResponse.json({ ok: false, error: "Unable to sign out" }, { status: 500 });
  }
}
