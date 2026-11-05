import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ name: "fixture" })),
  isSupported: vi.fn(async () => true),
  initializeAnalytics: vi.fn(() => ({ app: "fixture" })),
  setAnalyticsCollectionEnabled: vi.fn(),
  setConsent: vi.fn(),
  logEvent: vi.fn(),
  clientId: vi.fn(async () => "1234.5678"),
}));

vi.mock("firebase/app", () => ({
  initializeApp: mocks.initializeApp,
  getApps: () => [],
}));
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
  setConsent: mocks.setConsent,
  logEvent: mocks.logEvent,
  getGoogleAnalyticsClientId: mocks.clientId,
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
  for (const suffix of [
    "API_KEY",
    "AUTH_DOMAIN",
    "PROJECT_ID",
    "APP_ID",
    "MEASUREMENT_ID",
  ])
    vi.stubEnv(`NEXT_PUBLIC_FIREBASE_${suffix}`, "fixture");
  mocks.isSupported.mockResolvedValue(true);
  mocks.clientId.mockResolvedValue("1234.5678");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
    await logFirebasePageView(
      "/dashboard/actors/private-actor/runs/private-run",
    );
    expect(mocks.initializeAnalytics).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        config: expect.objectContaining({
          send_page_view: false,
          page_referrer: "",
        }),
      }),
    );
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.anything(),
      "page_view",
      expect.objectContaining({
        page_path: "/dashboard/actors/_/runs/_",
        page_location: expect.stringMatching(
          /\/dashboard\/actors\/_\/runs\/_$/,
        ),
        page_title: "ActorConsole",
      }),
    );
    expect(mocks.setConsent).toHaveBeenLastCalledWith({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    consent("essential");
    const { setFirebaseAnalyticsCollectionEnabled } =
      await import("./firebase");
    await setFirebaseAnalyticsCollectionEnabled(false);
    expect(
      (window as unknown as Record<string, unknown>)["ga-disable-fixture"],
    ).toBe(true);
    expect(mocks.setConsent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        analytics_storage: "denied",
        ad_storage: "denied",
      }),
    );
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

  it("shares initialization across concurrent events and tolerates unsupported browsers", async () => {
    consent("all");
    const { logFirebaseEvent } = await import("./firebase");
    await Promise.all([
      logFirebaseEvent("login"),
      logFirebaseEvent("email_verified"),
    ]);
    expect(mocks.initializeAnalytics).toHaveBeenCalledOnce();
    expect(mocks.logEvent).toHaveBeenCalledTimes(2);
    vi.resetModules();
    mocks.isSupported.mockResolvedValue(false);
    const unsupported = await import("./firebase");
    await unsupported.logFirebaseEvent("login");
    expect(mocks.logEvent).toHaveBeenCalledTimes(2);
  });

  it("waits for the delivery callback before completing a navigation event", async () => {
    consent("all");
    const { logFirebaseEvent } = await import("./firebase");
    let completed = false;
    const pending = logFirebaseEvent(
      "checkout_redirected",
      {},
      { waitForDelivery: true },
    ).then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(mocks.logEvent).toHaveBeenCalledOnce());
    expect(completed).toBe(false);
    const params = mocks.logEvent.mock.calls[0][2];
    expect(params.event_timeout).toBe(250);
    params.event_callback();
    await pending;
    expect(completed).toBe(true);
  });

  it("enables DebugView only when the explicit debug build flag is set", async () => {
    consent("all");
    const { logFirebaseEvent } = await import("./firebase");
    await logFirebaseEvent("login");
    expect(mocks.logEvent.mock.calls[0][2]).not.toHaveProperty("debug_mode");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_ANALYTICS_DEBUG", "true");
    await logFirebaseEvent("login");
    expect(mocks.logEvent.mock.calls[1][2]).toHaveProperty("debug_mode", true);
  });

  it("allows navigation to continue when the delivery callback never arrives", async () => {
    consent("all");
    const { getFirebaseAnalytics, logFirebaseEvent } =
      await import("./firebase");
    await getFirebaseAnalytics();
    vi.useFakeTimers();
    const pending = logFirebaseEvent(
      "checkout_redirected",
      {},
      { waitForDelivery: true },
    );
    await vi.advanceTimersByTimeAsync(250);
    await expect(pending).resolves.toBeUndefined();
  });

  it("does not access browser globals during server rendering", async () => {
    const { logFirebasePageView, logFirebaseEvent } =
      await import("./firebase");
    vi.stubGlobal("window", undefined);
    await expect(logFirebasePageView("/dashboard")).resolves.toBeUndefined();
    await expect(logFirebaseEvent("login")).resolves.toBeUndefined();
    expect(mocks.initializeAnalytics).not.toHaveBeenCalled();
  });

  it("reads the SDK client/session identity for checkout only while consent remains granted", async () => {
    consent("all");
    const original = (window as unknown as Record<string, unknown>).gtag;
    (window as unknown as Record<string, unknown>).gtag = (
      _command: string,
      _id: string,
      _field: string,
      callback: (value: number) => void,
    ) => callback(1793850000);
    try {
      const { getFirebasePaymentAnalyticsContext } = await import("./firebase");
      expect(await getFirebasePaymentAnalyticsContext()).toEqual({
        clientId: "1234.5678",
        sessionId: "1793850000",
        measurementId: "fixture",
      });
      mocks.clientId.mockImplementationOnce(async () => {
        consent("essential");
        return "1234.5678";
      });
      expect(await getFirebasePaymentAnalyticsContext()).toBeNull();
    } finally {
      (window as unknown as Record<string, unknown>).gtag = original;
    }
  });
});
