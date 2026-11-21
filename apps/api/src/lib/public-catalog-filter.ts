import type { Prisma } from "@actorconsole/db";

// Reconciled placeholder IDs contain owner/name. Only actual Store records
// belong in public catalog discovery.
export const PUBLIC_CATALOG_ACTOR_WHERE = {
  isPublic: true,
  isDeprecated: false,
  apifyActorId: { not: { contains: "/" } },
} satisfies Prisma.StoreActorWhereInput;
