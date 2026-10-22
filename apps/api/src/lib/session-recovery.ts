import { db } from "@actorconsole/db";
import { requestCookies } from "./http-context.js";
import { ORIGINAL_SESSION_COOKIE } from "./impersonation.js";

/** Reveal only recovery availability; the HttpOnly administrator token stays on the API. */
export async function canRecoverMimicSession() {
  const token = (await requestCookies()).get(ORIGINAL_SESSION_COOKIE)?.value;
  if (!token) return false;
  const session = await db.session.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  });
  return Boolean(
    session &&
    session.expires > new Date() &&
    !session.impersonatedById &&
    !session.user.suspendedAt &&
    ["ADMIN", "SUPER_ADMIN"].includes(session.user.role),
  );
}
