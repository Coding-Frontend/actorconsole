"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import type { MimicStatus } from "@/lib/impersonation";

export function ImpersonationBanner({ status }: { status: MimicStatus | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/impersonate/exit", { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.ok)
        throw new Error(body.error ?? "Could not return to admin. Please retry.");
      window.location.assign(body.data.redirectTo);
    } catch (exitError) {
      setError(
        exitError instanceof Error ? exitError.message : "Could not return to admin. Please retry.",
      );
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(
      () => void exit(),
      Math.max(0, Date.parse(status.expiresAt) - Date.now() - 5_000),
    );
    return () => window.clearTimeout(timer);
  }, [status, exit]);

  if (!status) return null;

  return (
    <div
      role="region"
      aria-label="Mimic user session"
      className="border-signal-orange/40 bg-signal-orange/10 border-b px-4 py-2"
    >
      <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-signal-orange flex min-w-0 items-center gap-2 font-medium">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            You are currently seeing the page as {status.user.name || status.user.email}.
            {status.user.name ? (
              <span className="ml-1 font-normal">({status.user.email})</span>
            ) : null}
            <span className="ml-2 font-normal">Actions apply to this user&apos;s account.</span>
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void exit()} disabled={busy}>
          {busy ? "Returning…" : "Return to admin"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
