import { JsonResponse } from "../../lib/http-context.js";
import { db } from "@actorconsole/db";
import { getLogger } from "@actorconsole/shared";
import { verifyIdToken } from "../../lib/firebase-admin.js";
import { getFirebaseSocialIdentity } from "../../lib/firebase-social.js";
import { authUserSelect, completeUserLogin } from "../../lib/server-session.js";

const log = getLogger("api:firebase-social-auth");


/** Exchange a Firebase Google/GitHub token for an ActorConsole database session. */
export async function POST(req: Request) {
  try {
    const { idToken, totpCode, challengeToken } = (await req.json()) as {
      idToken?: string;
      totpCode?: string;
      challengeToken?: string;
    };
    if (!idToken) {
      return JsonResponse.json({ ok: false, error: "Missing idToken" }, { status: 400 });
    }

    const decoded = await verifyIdToken(idToken);
    const identity = getFirebaseSocialIdentity(decoded);
    if (!identity) {
      return JsonResponse.json(
        { ok: false, error: "Firebase is only accepted for Google and GitHub sign-in" },
        { status: 403 },
      );
    }
    if (!decoded.email || !decoded.email_verified) {
      return JsonResponse.json(
        { ok: false, error: "The social provider must supply a verified email address" },
        { status: 403 },
      );
    }

    const email = decoded.email.trim().toLowerCase();
    const name = decoded.name ?? email.split("@")[0] ?? null;
    const image = decoded.picture ?? null;

    const user = await db.$transaction(async (tx) => {
      const linked = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: identity.provider,
            providerAccountId: identity.providerAccountId,
          },
        },
        include: { user: { select: authUserSelect } },
      });
      if (linked) {
        if (linked.user.email.toLowerCase() !== email) throw new Error("SOCIAL_EMAIL_CHANGED");
        return linked.user;
      }

      const existing = await tx.user.findUnique({ where: { email }, select: authUserSelect });
      const resolved = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              emailVerified: existing.emailVerified ?? new Date(),
              name: existing.name ?? name,
              image: existing.image ?? image,
            },
            select: authUserSelect,
          })
        : await tx.user.create({
            data: { email, name, image, emailVerified: new Date() },
            select: authUserSelect,
          });

      await tx.account.create({
        data: {
          userId: resolved.id,
          type: "oauth",
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
        },
      });
      return resolved;
    });

    return completeUserLogin(req, user, { totpCode, challengeToken });
  } catch (error) {
    if (error instanceof Error && error.message === "SOCIAL_EMAIL_CHANGED") {
      return JsonResponse.json(
        { ok: false, error: "This social identity is linked to a different account email" },
        { status: 409 },
      );
    }
    log.error({ error }, "Firebase social session exchange failed");
    return JsonResponse.json({ ok: false, error: "Unable to create a session" }, { status: 500 });
  }
}
