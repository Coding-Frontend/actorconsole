import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { acceptPolicySchema, policySlugSchema, type PolicySlug } from "@actorconsole/shared";
import { db } from "@actorconsole/db";
import { requireAuth } from "../middleware/auth";

const SLUG_PARAM = z.object({ slug: policySlugSchema });

const ACCEPTANCE_FIELDS: Record<PolicySlug, { acceptedAt: string; version: string }> = {
  TERMS: { acceptedAt: "termsAcceptedAt", version: "termsVersion" },
  PRIVACY: { acceptedAt: "privacyAcceptedAt", version: "privacyVersion" },
  COOKIES: { acceptedAt: "privacyAcceptedAt", version: "privacyVersion" }, // falls under privacy
  REFUND: { acceptedAt: "termsAcceptedAt", version: "termsVersion" },
  AUP: { acceptedAt: "termsAcceptedAt", version: "termsVersion" },
  DPA: { acceptedAt: "privacyAcceptedAt", version: "privacyVersion" },
};

async function getCurrentPublished(slug: PolicySlug) {
  return db.policy.findFirst({
    where: { slug, status: "PUBLISHED", deletedAt: null },
    orderBy: { publishedAt: "desc" },
  });
}

export const policyRoutes = new Hono()
  // Public — latest published version of a policy.
  .get("/:slug", zValidator("param", SLUG_PARAM), async (c) => {
    const { slug } = c.req.valid("param");
    const policy = await getCurrentPublished(slug);
    if (!policy) return c.json({ error: { code: "not_found" } }, 404);
    return c.json({
      data: {
        slug: policy.slug,
        title: policy.title,
        body: policy.body,
        version: policy.version,
        publishedAt: policy.publishedAt,
      },
    });
  })

  // Public — version history (published only, newest first).
  .get("/:slug/versions", zValidator("param", SLUG_PARAM), async (c) => {
    const { slug } = c.req.valid("param");
    const versions = await db.policy.findMany({
      where: { slug, status: "PUBLISHED", deletedAt: null },
      orderBy: { publishedAt: "desc" },
      select: { version: true, title: true, publishedAt: true },
    });
    return c.json({ data: versions });
  })

  // Auth — accept a published policy version.
  .use("/:slug/accept", requireAuth())
  .post(
    "/:slug/accept",
    zValidator("param", SLUG_PARAM),
    zValidator("json", acceptPolicySchema),
    async (c) => {
      const { slug } = c.req.valid("param");
      const { version } = c.req.valid("json");

      const policy = await db.policy.findUnique({
        where: { slug_version: { slug, version } },
      });
      if (!policy || policy.status !== "PUBLISHED" || policy.deletedAt) {
        return c.json({ error: { code: "not_published" } }, 404);
      }

      const session = c.get("session");
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || null;
      const userAgent = c.req.header("user-agent") || null;

      await db.$transaction([
        db.policyAcceptance.create({
          data: {
            userId: session.userId,
            policyId: policy.id,
            policySlug: slug,
            version,
            ip,
            userAgent,
          },
        }),
        db.user.update({
          where: { id: session.userId },
          data: {
            [ACCEPTANCE_FIELDS[slug].acceptedAt]: new Date(),
            [ACCEPTANCE_FIELDS[slug].version]: version,
          },
        }),
      ]);

      return c.json({ data: { accepted: true, slug, version } });
    },
  )

  // Auth — check whether the current user is up to date on the gating policies.
  .use("/me/acceptance", requireAuth())
  .get("/me/acceptance", async (c) => {
    c.header("Cache-Control", "private, no-store, max-age=0");
    const session = c.get("session");
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        termsAcceptedAt: true,
        termsVersion: true,
        privacyAcceptedAt: true,
        privacyVersion: true,
      },
    });
    if (!user) return c.json({ error: { code: "not_found" } }, 404);
    const [terms, privacy] = await Promise.all([
      getCurrentPublished("TERMS"),
      getCurrentPublished("PRIVACY"),
    ]);

    // A user can only accept a version that actually exists. Requiring an
    // unpublished policy creates a banner that can never be cleared.
    const needsTermsAcceptance = Boolean(
      terms && (!user.termsAcceptedAt || user.termsVersion !== terms.version),
    );
    const needsPrivacyAcceptance = Boolean(
      privacy && (!user.privacyAcceptedAt || user.privacyVersion !== privacy.version),
    );
    const needsAcceptance = needsTermsAcceptance || needsPrivacyAcceptance;

    return c.json({
      data: {
        terms: user.termsAcceptedAt
          ? { acceptedAt: user.termsAcceptedAt, version: user.termsVersion }
          : null,
        privacy: user.privacyAcceptedAt
          ? { acceptedAt: user.privacyAcceptedAt, version: user.privacyVersion }
          : null,
        currentTermsVersion: terms?.version ?? null,
        currentPrivacyVersion: privacy?.version ?? null,
        needsTermsAcceptance,
        needsPrivacyAcceptance,
        needsAcceptance,
      },
    });
  });
