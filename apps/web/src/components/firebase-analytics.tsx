"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_CHANGE_EVENT, getConsent } from "@/components/cookie-consent";
import {
  getFirebaseAnalytics,
  logFirebasePageView,
  setFirebaseAnalyticsCollectionEnabled,
} from "@/lib/firebase";

/** Collect one page view per navigation, including the page on which consent is granted. */
export function FirebaseAnalytics() {
  const pathname = usePathname();
  const lastPage = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    let active = true;

    async function recordPage() {
      if (getConsent() !== "all") return;
      const analytics = await getFirebaseAnalytics();
      if (!active || !analytics || getConsent() !== "all" || lastPage.current === pathname) return;
      lastPage.current = pathname;
      await logFirebasePageView(pathname);
    }

    function consentChanged() {
      const enabled = getConsent() === "all";
      if (!enabled) lastPage.current = null;
      void setFirebaseAnalyticsCollectionEnabled(enabled);
      if (enabled) void recordPage();
    }

    function storageChanged(event: StorageEvent) {
      if (event.key === "actorconsole.cookie-consent" || event.key === null) consentChanged();
    }

    void recordPage();
    window.addEventListener(CONSENT_CHANGE_EVENT, consentChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      active = false;
      window.removeEventListener(CONSENT_CHANGE_EVENT, consentChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, [pathname]);

  return null;
}
