"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { refreshWorkspaceActors } from "@/lib/actor-refresh";

const AUTO_REFRESH_INTERVAL_MS = 5 * 60_000;

/**
 * Starts stale-while-revalidate after dashboard content is visible. The API
 * deduplicates pending refreshes. Share a bounded cooldown across tabs and
 * reloads; manual Refresh from Apify always bypasses this automatic throttle.
 */
export function WorkspaceDataRefresher({
  workspaceId,
  disabled = false,
}: {
  workspaceId: string | null;
  disabled?: boolean;
}) {
  const pathname = usePathname();
  const enabled = !disabled && pathname !== "/dashboard/onboarding";

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    const storageKey = `actorconsole:actor-auto-refresh-v2:${workspaceId}`;
    const controller = new AbortController();
    let timeout: number | undefined;
    const refresh = async () => {
      if (controller.signal.aborted || document.visibilityState !== "visible") return;
      const start = async () => {
        if (controller.signal.aborted) return;
        let lastStartedAt = automaticAttempts.get(workspaceId) ?? 0;
        try { lastStartedAt = Number(window.localStorage.getItem(storageKey) ?? 0); }
        catch { /* Storage-restricted browsers retain a per-document cooldown. */ }
        const elapsed = Date.now() - lastStartedAt;
        if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < AUTO_REFRESH_INTERVAL_MS) return;
        automaticAttempts.set(workspaceId, Date.now());
        if (automaticAttempts.size > 100) automaticAttempts.delete(automaticAttempts.keys().next().value!);
        try { window.localStorage.setItem(storageKey, String(Date.now())); }
        catch { /* Optional timestamp only; credentials are never stored here. */ }
        await refreshWorkspaceActors({ signal: controller.signal }).catch(() => undefined);
      };
      if (navigator.locks) {
        await navigator.locks.request(storageKey, { ifAvailable: true }, async (lock) => {
          if (lock) await start();
        }).catch(() => undefined);
      } else await start();
    };
    const schedule = () => {
      window.clearTimeout(timeout);
      if (document.visibilityState === "visible") timeout = window.setTimeout(() => void refresh(), 1_500);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [enabled, workspaceId]);

  return null;
}

const automaticAttempts = new Map<string, number>();
