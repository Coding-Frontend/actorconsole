import { Prisma } from "@prisma/client";
import { db } from "./index.js";

/**
 * Permanently removes a user-owned workspace after the account grace period.
 *
 * Financial records are retained only in their de-identified form: ownership,
 * provider customer identifiers, descriptions, and free-form notes are
 * removed, while amount/currency/status remain available for accounting.
 * Keeping this operation in the database package makes the API, admin panel,
 * and worker use the same deletion semantics.
 */
export async function hardDeleteUser(userId: string): Promise<boolean> {
  const exists = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, deletionOriginalEmail: true },
  });
  if (!exists) return false;

  const emailToAnonymize = exists.deletionOriginalEmail ?? exists.email;

  await db.$transaction(async (tx) => {
    // Remove restrictive or cross-user relations before the user row.
    await tx.impersonationSession.deleteMany({
      where: { OR: [{ adminId: userId }, { targetUserId: userId }] },
    });
    await tx.blogPost.deleteMany({ where: { authorId: userId } });
    await tx.coupon.updateMany({ where: { createdById: userId }, data: { createdById: null } });

    // Keep the minimum financial evidence required for reconciliation without
    // retaining a direct personal identifier.
    await tx.subscription.updateMany({
      where: { userId },
      data: {
        userId: null,
        providerCustomerId: null,
        razorpayCustomerId: null,
        notes: "Account deleted; subscription ownership redacted",
      },
    });
    await tx.payment.updateMany({
      where: { userId },
      data: {
        userId: null,
        providerInvoiceId: null,
        razorpayInvoiceId: null,
        description: null,
        notes: Prisma.JsonNull,
      },
    });
    await tx.analyticsEvent.deleteMany({ where: { userId } });
    await tx.newsletterSubscriber.deleteMany({ where: { userId } });
    await tx.emailLog.updateMany({
      where: { to: { in: [exists.email, emailToAnonymize] } },
      data: { to: `deleted+${userId}@invalid.local` },
    });

    // Actor has Restrict semantics at the user boundary. Deleting the actor
    // rows explicitly allows their dependent snapshots, runs, and schedules
    // to cascade safely before the account is removed.
    await tx.actor.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  return true;
}

export async function purgeDueUsers(limit = 50): Promise<number> {
  const due = await db.user.findMany({
    where: { deletionScheduledFor: { lte: new Date() } },
    select: { id: true },
    orderBy: { deletionScheduledFor: "asc" },
    take: limit,
  });

  let purged = 0;
  for (const user of due) {
    if (await hardDeleteUser(user.id)) purged++;
  }
  return purged;
}

export async function cancelScheduledDeletion(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { deletionScheduledFor: true, deletionOriginalEmail: true },
  });
  if (!user?.deletionScheduledFor) return false;

  if (user.deletionOriginalEmail) {
    const conflictingUser = await db.user.findFirst({
      where: { email: user.deletionOriginalEmail, NOT: { id: userId } },
      select: { id: true },
    });
    if (conflictingUser) {
      throw new Error("deletion_email_conflict");
    }
  }

  const result = await db.user.updateMany({
    where: { id: userId, deletionScheduledFor: { not: null } },
    data: {
      ...(user.deletionOriginalEmail ? { email: user.deletionOriginalEmail } : {}),
      deletionOriginalEmail: null,
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      suspendedAt: null,
      bannedReason: null,
    },
  });
  return result.count > 0;
}
