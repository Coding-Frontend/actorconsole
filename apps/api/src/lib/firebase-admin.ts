import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const firebaseJwks = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

export type FirebaseDecodedIdToken = JWTPayload & {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  auth_time?: number;
  firebase?: Record<string, unknown>;
};

function getFirebaseProjectId(): string {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  if (!projectId) {
    throw new Error("Firebase project ID is required to verify Firebase ID tokens.");
  }

  return projectId;
}

/**
 * Verify a Firebase ID token with Google's public Secure Token keys.
 *
 * The backend needs only a project ID and Google's public signing keys.
 */
export async function verifyIdToken(idToken: string): Promise<FirebaseDecodedIdToken> {
  const projectId = getFirebaseProjectId();
  const { payload } = await jwtVerify(idToken, firebaseJwks, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });

  if (!payload.sub || payload.sub.length > 128) {
    throw new Error("Firebase ID token has an invalid subject.");
  }

  const authTime = payload.auth_time;
  if (typeof authTime !== "number" || authTime > Math.floor(Date.now() / 1000)) {
    throw new Error("Firebase ID token has an invalid authentication time.");
  }

  return payload as FirebaseDecodedIdToken;
}
