import { db } from "@actorconsole/db";

export async function hasImpersonationAuthority(adminId: string): Promise<boolean> {
  const admin = await db.user.findUnique({
    where: { id: adminId },
    select: { role: true, suspendedAt: true, deletionScheduledFor: true },
  });
  return (
    !!admin &&
    !admin.suspendedAt &&
    !admin.deletionScheduledFor &&
    (admin.role === "ADMIN" || admin.role === "SUPER_ADMIN")
  );
}
