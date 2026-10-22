import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

import { isOnboardingExemptPath, OnboardingGate } from "./onboarding-gate";

describe("OnboardingGate", () => {
  beforeEach(() => {
    navigation.pathname = "/dashboard";
    navigation.replace.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps account operations available while onboarding is incomplete", () => {
    for (const pathname of [
      "/dashboard/profile",
      "/dashboard/notification-preferences",
      "/dashboard/billing",
      "/dashboard/data-export",
      "/dashboard/account",
      "/dashboard/settings/profile",
      "/dashboard/settings/notifications",
      "/dashboard/settings/billing",
    ]) {
      expect(isOnboardingExemptPath(pathname)).toBe(true);
    }

    expect(isOnboardingExemptPath("/dashboard/actors")).toBe(false);
  });

  it("does not redirect an account page back to onboarding", () => {
    navigation.pathname = "/dashboard/billing";

    render(
      <OnboardingGate>
        <span>Billing page</span>
      </OnboardingGate>,
    );

    expect(screen.getByText("Billing page")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("allows workspace pages once a workspace exists, even before onboarding is complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { currentStep: "plan", workspace: { id: "workspace-1" } },
        }),
      }),
    );

    render(
      <OnboardingGate>
        <span>Workspace page</span>
      </OnboardingGate>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("still sends workspace pages to onboarding before a workspace exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { currentStep: "workspace", workspace: null } }),
      }),
    );

    render(
      <OnboardingGate>
        <span>Workspace page</span>
      </OnboardingGate>,
    );

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/dashboard/onboarding?step=workspace");
    });
  });

  it("keeps the current workspace page during a transient status failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("API unavailable")));

    render(
      <OnboardingGate>
        <span>Workspace page</span>
      </OnboardingGate>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("does not redirect when the status endpoint returns a non-success response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { code: "temporarily_unavailable" } }),
      }),
    );

    render(
      <OnboardingGate>
        <span>Workspace page</span>
      </OnboardingGate>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
