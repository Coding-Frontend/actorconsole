"use client";

import { navigateInApp } from "@/lib/client-navigation";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api-base";

export function ApifyWorkspaceSettingsSelection() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("extension") !== "settings") return;
    const workspaceId = params.get("workspace");
    if (!workspaceId) {
      setMessage("The workspace selection is missing. Open it again from the extension sidebar.");
      return;
    }

    let cancelled = false;
    setMessage("Opening the selected workspace settings…");
    void fetch(
      `${API_BASE_URL}/account/business-profiles/${encodeURIComponent(workspaceId)}/select`,
      {
        method: "POST",
        credentials: "include",
      },
    )
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok) {
          throw new Error(body?.error?.message ?? "Could not select this ActorConsole workspace.");
        }
        if (!cancelled) {
          window.dispatchEvent(new Event("actorconsole:workspace-changed"));
          navigateInApp("/dashboard/apify", true);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not open workspace settings.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return message ? (
    <p role="status" className="border-border bg-card border px-4 py-3 text-sm">
      {message}
    </p>
  ) : null;
}
