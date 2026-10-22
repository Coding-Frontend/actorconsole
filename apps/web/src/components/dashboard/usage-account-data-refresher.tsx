"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api-base";

const REFRESH_INTERVAL_MS = 15 * 60_000;

export function UsageAccountDataRefresher({
  syncedAt,
  scope,
}: {
  syncedAt?: string | null;
  scope?: "usage" | "costs" | "revenue";
}) {
  const router = useRouter();

  useEffect(() => {
    const lastSync = syncedAt ? Date.parse(syncedAt) : 0;
    if (Number.isFinite(lastSync) && Date.now() - lastSync < REFRESH_INTERVAL_MS) return;

    const controller = new AbortController();
    void fetch(`${API_BASE_URL}/actors/${scope}/account-refresh`, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
    })
      .then((response) => {
        if (response.ok && !controller.signal.aborted) router.refresh();
      })
      .catch(() => {
        // Stored actor usage remains usable when Apify is temporarily unavailable.
      });

    return () => controller.abort();
  }, [router, scope, syncedAt]);

  return null;
}
