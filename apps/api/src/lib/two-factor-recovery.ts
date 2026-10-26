import type { Prisma } from "@actorconsole/db";

/** Claim against the stored code list so concurrent requests cannot reuse a code. */
export async function consumeTwoFactorRecoveryCode(
  client: Pick<Prisma.TransactionClient, "user">,
  userId: string,
  recoveryHash: string,
  encryptedSecret: string,
): Promise<boolean> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true, totpSecretEncrypted: true, totpRecoveryCodes: true },
  });
  const codes = Array.isArray(user?.totpRecoveryCodes)
    ? user.totpRecoveryCodes.filter((item): item is string => typeof item === "string")
    : [];
  if (!user?.totpEnabled || !user.totpSecretEncrypted ||
    user.totpSecretEncrypted !== encryptedSecret || !codes.includes(recoveryHash)) return false;

  const claimed = await client.user.updateMany({
    where: {
      id: userId,
      totpEnabled: true,
      totpSecretEncrypted: user.totpSecretEncrypted,
      totpRecoveryCodes: { equals: codes },
    },
    data: { totpRecoveryCodes: codes.filter((code) => code !== recoveryHash) },
  });
  return claimed.count === 1;
}
