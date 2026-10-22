import type { FirebaseDecodedIdToken } from "./firebase-admin.js";

export type FirebaseSocialIdentity = {
  provider: "firebase-google" | "firebase-github";
  providerAccountId: string;
};

export function getFirebaseSocialIdentity(
  token: FirebaseDecodedIdToken,
): FirebaseSocialIdentity | null {
  const firebase = token.firebase as
    { sign_in_provider?: unknown; identities?: Record<string, unknown> } | undefined;
  const providerId = firebase?.sign_in_provider;
  if (providerId !== "google.com" && providerId !== "github.com") return null;
  const provider = providerId === "google.com" ? "firebase-google" : "firebase-github";

  const identities = firebase?.identities?.[providerId];
  const providerAccountId =
    Array.isArray(identities) && typeof identities[0] === "string" ? identities[0] : token.sub;
  return providerAccountId ? { provider, providerAccountId } : null;
}
