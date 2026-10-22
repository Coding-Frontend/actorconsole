"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth as firebaseGetAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";

// Browser configuration is public. Each installation supplies its own project.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Analytics/storage settings are optional for Google/GitHub authentication.
const missingFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
].some((value) => !value);

function throwIfFirebaseIsNotConfigured() {
  if (!missingFirebaseConfig) return;

  const error = new Error(
    "Firebase authentication is not configured for this environment. Contact the administrator to enable sign-in.",
  ) as Error & { code: string };
  error.code = "auth/configuration-not-found";
  throw error;
}

// Lazy-initialized Firebase singletons — guarded so they never run during
// server-side prerendering where `window` and env vars are unavailable.
let _auth: ReturnType<typeof firebaseGetAuth> | null = null;
let _analytics: import("firebase/analytics").Analytics | null = null;
let _analyticsModule: typeof import("firebase/analytics") | null = null;
let _analyticsPromise: Promise<import("firebase/analytics").Analytics | null> | null = null;
let _analyticsCollectionEnabled = true;

function getFirebaseApp() {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

export function getAuth() {
  throwIfFirebaseIsNotConfigured();
  if (!_auth) {
    _auth = firebaseGetAuth(getFirebaseApp());
  }
  return _auth;
}

async function getAnalyticsModule() {
  _analyticsModule ??= await import("firebase/analytics");
  return _analyticsModule;
}

/**
 * Lazily initialize Firebase Analytics. Analytics is loaded only in a browser
 * after the cookie-consent component has confirmed an opt-in.
 */
export async function getFirebaseAnalytics() {
  if (typeof window === "undefined" || !firebaseConfig.measurementId) return null;
  throwIfFirebaseIsNotConfigured();
  if (_analytics) return _analytics;
  if (_analyticsPromise) return _analyticsPromise;

  _analyticsPromise = (async () => {
    try {
      const analyticsModule = await getAnalyticsModule();
      if (!(await analyticsModule.isSupported())) return null;
      _analytics = analyticsModule.getAnalytics(getFirebaseApp());
      analyticsModule.setAnalyticsCollectionEnabled(_analytics, _analyticsCollectionEnabled);
      return _analytics;
    } catch {
      // Analytics is optional and unsupported browsers should not affect auth
      // or the rest of the application.
      return null;
    } finally {
      _analyticsPromise = null;
    }
  })();

  return _analyticsPromise;
}

/** Log a GA4 page view for client-side route transitions. */
export async function logFirebasePageView(pathname: string) {
  const analytics = await getFirebaseAnalytics();
  if (!analytics) return;

  const analyticsModule = await getAnalyticsModule();
  analyticsModule.logEvent(analytics, "page_view", {
    page_path: pathname,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/** Log an optional, consent-gated product event. */
export async function logFirebaseEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
) {
  try {
    const analytics = await getFirebaseAnalytics();
    if (!analytics) return;

    const analyticsModule = await getAnalyticsModule();
    analyticsModule.logEvent(analytics, eventName, params);
  } catch {
    // Product analytics must never affect the user-facing workflow.
  }
}

/** Stop collection when optional analytics consent is revoked. */
export async function setFirebaseAnalyticsCollectionEnabled(enabled: boolean) {
  _analyticsCollectionEnabled = enabled;
  if (!_analytics) return;
  const analyticsModule = await getAnalyticsModule();
  analyticsModule.setAnalyticsCollectionEnabled(_analytics, enabled);
}

// Proxy-based `auth` export: property accesses are forwarded to the lazy singleton.
// This keeps `auth.currentUser`, `auth.onAuthStateChanged(...)`, etc. working
// exactly as before while deferring initialization to the first access.
export const auth = new Proxy({} as ReturnType<typeof firebaseGetAuth>, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuth(), prop, receiver);
  },
});

// Providers
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
githubProvider.addScope("user:email");

// Auth actions
export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithGitHub() {
  return signInWithPopup(auth, githubProvider);
}

export async function signOutFirebase() {
  return firebaseSignOut(auth);
}

/**
 * Exchange a Firebase ID token for a backend-issued session cookie.
 * Called only after a Firebase Google or GitHub sign-in.
 */
export interface FirebaseSessionExchangeResult {
  ok: boolean;
  error?: string;
  requiresTwoFactor?: boolean;
  challengeToken?: string;
}

type FirebaseSessionExchangeInput = {
  totpCode?: string;
  challengeToken?: string;
};

export async function exchangeFirebaseToken(
  input: FirebaseSessionExchangeInput = {},
  firebaseUser?: FirebaseUser,
): Promise<FirebaseSessionExchangeResult> {
  // Prefer the credential returned by the sign-in call. Firebase updates
  // auth.currentUser asynchronously after popup/email sign-in, so relying on
  // the singleton alone can race and report a false "No Firebase user" error.
  const user = firebaseUser ?? auth.currentUser;
  if (!user) return { ok: false, error: "No Firebase user" };

  const idToken = await user.getIdToken();
  const res = await fetch("/api/auth/firebase-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ idToken, ...input }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error ?? "Session creation failed" };
  }

  return {
    ok: true,
    requiresTwoFactor: data.requiresTwoFactor,
    challengeToken: data.challengeToken,
  };
}

export type { FirebaseUser };
