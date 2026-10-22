"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MimicSessionRecovery() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function restore() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/impersonate/exit", { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.ok)
        throw new Error(body.error ?? "Could not restore your admin session");
      window.location.assign(body.data.redirectTo);
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Could not restore your admin session",
      );
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg space-y-4 px-6 py-20">
      <h1 className="text-2xl font-semibold">Your mimic session has ended</h1>
      <p className="text-muted-foreground text-sm">
        Return to your administrator account to continue.
      </p>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button onClick={() => void restore()} disabled={busy}>
          {busy ? "Returning…" : "Return to admin"}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/login">Sign in again</Link>
        </Button>
      </div>
    </main>
  );
}
