"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api-base";

type OnboardingStep = "workspace" | "credentials" | "plan" | "complete";
type OnboardingStatus = {
  currentStep?: OnboardingStep;
  workspace?: { id: string } | null;
};

export const WORKSPACE_CHANGED_EVENT = "actorconsole:workspace-changed";

const ONBOARDING_EXEMPT_PATHS = [
  "/dashboard/default",
  "/dashboard/upgrade",
  "/dashboard/keywords",
  "/dashboard/mcp",
  "/dashboard/apify",
  "/dashboard/support",
  "/dashboard/profile",
  "/dashboard/notification-preferences",
  "/dashboard/billing",
  "/dashboard/data-export",
  "/dashboard/account",
  // Keep the older settings URLs usable for bookmarked links as well.
  "/dashboard/settings/profile",
  "/dashboard/settings/notifications",
  "/dashboard/settings/billing",
  "/dashboard/settings/export",
  "/dashboard/settings/account",
] as const;

export function isOnboardingExemptPath(pathname: string): boolean {
  return ONBOARDING_EXEMPT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isOnboardingRoute = pathname === "/dashboard/onboarding";
  const isAccountRoute = isOnboardingExemptPath(pathname);
  // Onboarding is a navigation guard, not an authorization boundary. Render
  // the database-backed dashboard immediately and verify the setup in the
  // background so every page is not hidden behind an extra API round trip.
  // Account and billing operations stay available while workspace setup is
  // in progress; workspace routes only return to onboarding before the first
  // workspace exists.

  const checkOnboarding = useCallback(async () => {
    if (isOnboardingRoute || isAccountRoute) return;

    try {
      const response = await fetch(`${API_BASE_URL}/account/onboarding`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as {
        data?: OnboardingStatus;
      } | null;
      // A transient API failure must not throw an existing workspace back
      // into onboarding. Authentication and workspace authorization remain
      // enforced by the server/API; this client guard only redirects when a
      // successful status response explicitly confirms that no workspace
      // exists.
      if (!response.ok) return;
      // Creating a workspace is the only hard prerequisite for workspace
      // routes. Credentials and plan selection remain optional onboarding
      // steps; their capabilities are enforced by the API and navigation.
      if (body?.data?.workspace) return;
      const step = body?.data?.currentStep ?? "workspace";
      router.replace(`/dashboard/onboarding?step=${step}`);
    } catch {
      // The server layout still protects authentication. Defer onboarding
      // navigation until the status endpoint is available again.
    }
  }, [isAccountRoute, isOnboardingRoute, router]);

  useEffect(() => {
    void checkOnboarding();
    const handleWorkspaceChange = () => void checkOnboarding();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChange);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChange);
  }, [checkOnboarding]);

  return children;
}
