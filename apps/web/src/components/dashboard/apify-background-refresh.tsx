"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api-base";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";

const VALIDATION_INTERVAL_MS = 15 * 60_000;

export function ApifyBackgroundRefresh({
  apifyUserId,
  validatedAt,
  enabled,
}: {
  apifyUserId?: string;
  validatedAt?: string | null;
  enabled: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const persistedValidation = validatedAt ? new Date(validatedAt).getTime() : 0;
    if (
      Number.isFinite(persistedValidation) &&
      Date.now() - persistedValidation < VALIDATION_INTERVAL_MS
    ) {
      return;
    }

    const storageKey = `actorconsole:apify-validation:${apifyUserId ?? "active-workspace"}`;
    const sessionValidation = Number(window.sessionStorage.getItem(storageKey) ?? 0);
    if (Date.now() - sessionValidation < VALIDATION_INTERVAL_MS) return;
    window.sessionStorage.setItem(storageKey, String(Date.now()));

    let active = true;
    // Validation has already started on the API. Let it finish when changing
    // pages, but discard the result after this view unmounts.
    void fetch(`${API_BASE_URL}/apify/status?validate=true`, {
      cache: "no-store",
      credentials: "include",
      signal: AbortSignal.timeout(30_000),
    })
      .then(async (response) => {
        if (!response.ok) return;
        await response.json();
        if (!active) return;
        window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
        router.refresh();
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [apifyUserId, enabled, router, validatedAt]);

  return null;
}
