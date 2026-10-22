"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[24rem] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <div className="bg-destructive/10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
          <AlertTriangle className="text-destructive h-6 w-6" />
        </div>
        <h1 className="mt-6 text-2xl font-bold">Settings could not load</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Try again, or return to the dashboard while we recover the account settings view.
        </p>
        {error.digest ? <p className="text-muted-foreground mt-2 text-xs">Error ID: {error.digest}</p> : null}
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Try again
          </Button>
          <Button asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
