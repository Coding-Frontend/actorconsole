"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  CONSENT_CHANGE_EVENT,
  getConsent,
} from "@/components/cookie-consent";
import {
  getFirebaseAnalytics,
  logFirebasePageView,
  setFirebaseAnalyticsCollectionEnabled,
} from "@/lib/firebase";

/**
 * Initializes GA4 only after the visitor opts into optional analytics. The
 * Firebase SDK sends the initial page view during initialization; subsequent
 * App Router navigations are logged explicitly.
 */
export function FirebaseAnalytics() {
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    const isRouteChange =
      previousPathname.current !== null && previousPathname.current !== pathname;
    previousPathname.current = pathname;
    let cancelled = false;

    async function initializeAnalytics() {
      if (getConsent() !== "all") return;
      const analytics = await getFirebaseAnalytics();
      if (!analytics || cancelled) return;
      if (getConsent() !== "all") return;
      if (isRouteChange) await logFirebasePageView(pathname);
    }

    void initializeAnalytics();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    async function handleConsentChange() {
      if (getConsent() === "all") {
        await getFirebaseAnalytics();
        await setFirebaseAnalyticsCollectionEnabled(true);
      } else {
        await setFirebaseAnalyticsCollectionEnabled(false);
      }
    }

    window.addEventListener(CONSENT_CHANGE_EVENT, handleConsentChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, handleConsentChange);
  }, []);

  return null;
}
