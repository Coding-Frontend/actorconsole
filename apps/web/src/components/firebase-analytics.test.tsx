import { StrictMode } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/pricing",
  choice: null as string | null,
  getAnalytics: vi.fn(async () => ({})),
  pageView: vi.fn(async () => {}),
  collection: vi.fn(async () => {}),
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/components/cookie-consent", () => ({
  CONSENT_CHANGE_EVENT: "consent-changed",
  getConsent: () => mocks.choice,
}));
vi.mock("@/lib/firebase", () => ({
  getFirebaseAnalytics: mocks.getAnalytics,
  logFirebasePageView: mocks.pageView,
  setFirebaseAnalyticsCollectionEnabled: mocks.collection,
}));
import { FirebaseAnalytics } from "./firebase-analytics";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.choice = null;
  mocks.pathname = "/pricing";
});

describe("page views", () => {
  it("records the current page when consent is granted and subsequent navigation once", async () => {
    const view = render(
      <StrictMode>
        <FirebaseAnalytics />
      </StrictMode>,
    );
    expect(mocks.getAnalytics).not.toHaveBeenCalled();
    mocks.choice = "all";
    act(() => window.dispatchEvent(new Event("consent-changed")));
    await waitFor(() => expect(mocks.pageView).toHaveBeenCalledTimes(1));
    expect(mocks.pageView).toHaveBeenCalledWith("/pricing");
    mocks.pathname = "/dashboard";
    view.rerender(
      <StrictMode>
        <FirebaseAnalytics />
      </StrictMode>,
    );
    await waitFor(() => expect(mocks.pageView).toHaveBeenCalledTimes(2));
    expect(mocks.pageView).toHaveBeenLastCalledWith("/dashboard");
    mocks.choice = "essential";
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "actorconsole.cookie-consent" })));
    expect(mocks.collection).toHaveBeenLastCalledWith(false);
    mocks.pathname = "/contact";
    view.rerender(
      <StrictMode>
        <FirebaseAnalytics />
      </StrictMode>,
    );
    await act(async () => {});
    expect(mocks.pageView).toHaveBeenCalledTimes(2);
  });
});
