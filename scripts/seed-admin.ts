#!/usr/bin/env tsx
/**
 * Promote a user to SUPER_ADMIN so the admin panel can be exercised.
 *
 * Usage:
 *   pnpm db:seed:admin -- you@example.com
 *   pnpm db:seed:admin -- you@example.com --role=ADMIN
 *
 * Set ADMIN_SEED_PASSWORD to create/update a local password without placing it
 * in shell history. When omitted, an existing user is promoted without
 * changing credentials.
 */

import { UserRole } from "@prisma/client";
import { db as prisma } from "../packages/db/src/client";
import { hashPassword } from "../packages/db/src/password-auth";

async function main() {
  const args = process.argv.slice(2);
  const emailFlag = args.indexOf("--");
  const email = emailFlag >= 0 ? args[emailFlag + 1] : null;
  const roleFlag = args.find((a) => a.startsWith("--role="));
  const role = (roleFlag ? roleFlag.split("=")[1] : "SUPER_ADMIN") as UserRole;
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email) {
    console.error("Usage: pnpm db:seed:admin -- you@example.com [--role=ADMIN|SUPER_ADMIN|USER]");
    process.exit(1);
  }
  if (!["USER", "ADMIN", "SUPER_ADMIN"].includes(role)) {
    console.error(`Invalid role: ${role}`);
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user && !password) {
    console.error(`No user with email ${normalizedEmail}. Set ADMIN_SEED_PASSWORD to create it.`);
    process.exit(1);
  }
  const passwordHash = password ? await hashPassword(password) : null;

  // Pre-accept the latest published Terms + Privacy so admin dev doesn't get gated.
  const [terms, privacy] = await Promise.all([
    prisma.policy.findFirst({
      where: { slug: "TERMS", status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.policy.findFirst({
      where: { slug: "PRIVACY", status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
    }),
  ]);

  const saved = user
    ? await prisma.user.update({
        where: { id: user.id },
        data: {
          role,
          emailVerified: user.emailVerified ?? new Date(),
          termsAcceptedAt: terms ? new Date() : user.termsAcceptedAt,
          termsVersion: terms ? terms.version : user.termsVersion,
          privacyAcceptedAt: privacy ? new Date() : user.privacyAcceptedAt,
          privacyVersion: privacy ? privacy.version : user.privacyVersion,
          passwordCredential: passwordHash
            ? {
                upsert: {
                  create: { passwordHash },
                  update: { passwordHash },
                },
              }
            : undefined,
        },
      })
    : await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: normalizedEmail.split("@")[0] ?? "Admin",
          role,
          emailVerified: new Date(),
          termsAcceptedAt: terms ? new Date() : null,
          termsVersion: terms?.version ?? null,
          privacyAcceptedAt: privacy ? new Date() : null,
          privacyVersion: privacy?.version ?? null,
          passwordCredential: { create: { passwordHash: passwordHash! } },
        },
      });

  console.log(
    `✓ ${saved.email} → role=${role}, localPassword=${passwordHash ? "set" : "unchanged"}, terms=${terms?.version ?? "unchanged"}, privacy=${privacy?.version ?? "unchanged"}`,
  );
}

main()
  .catch((err) => {
    console.error("Admin seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
