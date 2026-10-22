import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ name: "fixture" })),
  getAuth: vi.fn(() => ({ currentUser: null })),
}));
vi.mock("firebase/app", () => ({ initializeApp: mocks.initializeApp, getApps: () => [] }));
vi.mock("firebase/auth", () => ({
  getAuth: mocks.getAuth,
  GoogleAuthProvider: class {},
  GithubAuthProvider: class { addScope() {} },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const suffix of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "APP_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "MEASUREMENT_ID"])
    vi.stubEnv(`NEXT_PUBLIC_FIREBASE_${suffix}`, "");
});
afterEach(() => vi.unstubAllEnvs());

it("does not connect an unconfigured installation to a default Firebase project", async () => {
  const { getAuth } = await import("./firebase");
  expect(() => getAuth()).toThrow("Firebase authentication is not configured");
  expect(mocks.initializeApp).not.toHaveBeenCalled();
});
it("uses the configured project without requiring optional analytics/storage settings", async () => {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "fixture-public-key");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "fixture.firebaseapp.com");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "fixture-project");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "fixture-app");
  const { getAuth } = await import("./firebase");
  getAuth();
  expect(mocks.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: "fixture-project" }));
});
