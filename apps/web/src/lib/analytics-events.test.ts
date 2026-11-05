import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent, trackEventBeforeNavigation } from "./analytics-events";
import { analyticsPageContext, analyticsPath } from "./analytics-path";

const mocks = vi.hoisted(() => ({
  consent: "all" as string | null,
  logEvent: vi.fn(),
}));
vi.mock("@/components/cookie-consent", () => ({
  getConsent: () => mocks.consent,
}));
vi.mock("@/lib/firebase", () => ({ logFirebaseEvent: mocks.logEvent }));

beforeEach(() => {
  mocks.consent = "all";
  mocks.logEvent.mockReset();
  window.history.replaceState({}, "", "/pricing");
});
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("product event delivery", () => {
  it.each([null, "essential", "rejected"])(
    "skips events with consent %s",
    async (choice) => {
      mocks.consent = choice;
      await trackEvent("login", { method: "email" });
      expect(mocks.logEvent).not.toHaveBeenCalled();
    },
  );

  it("attributes events to the route before navigation and strips sensitive URL data", async () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard/actors/private-id?token=secret#private-title",
    );
    const pending = trackEvent("actor_copy_generated", {});
    window.history.replaceState({}, "", "/dashboard");
    await pending;
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "actor_copy_generated",
      {
        page_path: "/dashboard/actors/_",
        page_location: `${window.location.origin}/dashboard/actors/_`,
        page_title: "ActorConsole",
        page_referrer: "",
        page_group: "dashboard",
      },
      { waitForDelivery: false },
    );
    expect(JSON.stringify(mocks.logEvent.mock.calls)).not.toMatch(
      /private-id|secret|private-title/,
    );
  });

  it("keeps SDK failures out of the product workflow", async () => {
    mocks.logEvent.mockRejectedValue(new Error("SDK unavailable"));
    await expect(
      trackEvent("login", { method: "email" }),
    ).resolves.toBeUndefined();
  });

  it("bounds navigation waits even when the analytics SDK does not finish loading", async () => {
    vi.useFakeTimers();
    mocks.logEvent.mockImplementation(() => new Promise(() => {}));
    let navigated = false;
    const pending = trackEventBeforeNavigation("onboarding_completed", {}).then(
      () => {
        navigated = true;
      },
    );
    await vi.advanceTimersByTimeAsync(299);
    expect(navigated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(navigated).toBe(true);
  });
});

describe("analytics routes", () => {
  it.each([
    ["/pricing?email=user@example.com#secret", "/pricing"],
    ["/signup/verify-email?email=user@example.com", "/signup/verify-email"],
    ["/builders/private-builder/actors/private-actor", "/builders/_/actors/_"],
    ["/unrecognized/private-path", "/_"],
  ])("sanitizes %s", (path, expected) => {
    expect(analyticsPath(path)).toBe(expected);
  });
  it("groups authentication pages without sending query values", () => {
    expect(
      analyticsPageContext(
        "/signup/verify-email?email=secret",
        "https://actorconsole.com",
      ),
    ).toMatchObject({
      page_group: "auth",
      page_location: "https://actorconsole.com/signup/verify-email",
    });
  });
});
