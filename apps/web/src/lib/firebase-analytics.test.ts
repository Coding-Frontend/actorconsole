import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ name: "fixture" })),
  isSupported: vi.fn(async () => true),
  initializeAnalytics: vi.fn(() => ({ app: "fixture" })),
  setAnalyticsCollectionEnabled: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("firebase/app", () => ({ initializeApp: mocks.initializeApp, getApps: () => [] }));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: class {},
  GithubAuthProvider: class {
    addScope() {}
  },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("firebase/analytics", () => ({
  isSupported: mocks.isSupported,
  initializeAnalytics: mocks.initializeAnalytics,
  setAnalyticsCollectionEnabled: mocks.setAnalyticsCollectionEnabled,
  logEvent: mocks.logEvent,
}));

function consent(choice: string) {
  localStorage.setItem(
    "actorconsole.cookie-consent",
    JSON.stringify({ version: 1, choice, timestamp: 0 }),
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  for (const suffix of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "APP_ID", "MEASUREMENT_ID"])
    vi.stubEnv(`NEXT_PUBLIC_FIREBASE_${suffix}`, "fixture");
  mocks.isSupported.mockResolvedValue(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe("Firebase Analytics consent", () => {
  it("does not initialize or log an event without opt-in", async () => {
    const { logFirebaseEvent } = await import("./firebase");
    await logFirebaseEvent("login", { method: "email" });
    consent("essential");
    await logFirebaseEvent("login", { method: "email" });
    expect(mocks.initializeAnalytics).not.toHaveBeenCalled();
    expect(mocks.logEvent).not.toHaveBeenCalled();
  });

  it("redacts dynamic paths and does not send query strings or page titles", async () => {
    consent("all");
    const { logFirebasePageView } = await import("./firebase");
    await logFirebasePageView("/dashboard/actors/private-actor/runs/private-run");
    expect(mocks.initializeAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        config: expect.objectContaining({ send_page_view: false, page_referrer: "" }),
      }),
    );
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.anything(),
      "page_view",
      expect.objectContaining({
        page_path: "/dashboard/actors/_/runs/_",
        page_location: expect.stringMatching(/\/dashboard\/actors\/_\/runs\/_$/),
        page_title: "ActorConsole",
      }),
    );
    consent("essential");
    const { setFirebaseAnalyticsCollectionEnabled } = await import("./firebase");
    await setFirebaseAnalyticsCollectionEnabled(false);
    expect((window as unknown as Record<string, unknown>)["ga-disable-fixture"]).toBe(true);
    await logFirebasePageView("/dashboard");
    expect(mocks.logEvent).toHaveBeenCalledTimes(1);
  });

  it("does not initialize if consent is revoked while support is being checked", async () => {
    consent("all");
    let resolveSupport!: (value: boolean) => void;
    mocks.isSupported.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSupport = resolve;
        }),
    );
    const { logFirebaseEvent } = await import("./firebase");
    const pending = logFirebaseEvent("login", { method: "email" });
    await vi.waitFor(() => expect(resolveSupport).toBeDefined());
    consent("essential");
    resolveSupport(true);
    await pending;
    expect(mocks.initializeAnalytics).not.toHaveBeenCalled();
    expect(mocks.logEvent).not.toHaveBeenCalled();
  });
});
