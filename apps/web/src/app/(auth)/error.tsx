"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="home-grid-section flex min-h-[calc(100dvh-4rem)] flex-1">
      <div className="home-grid-frame grid flex-1 place-items-center p-6">
        <div className="blueprint-frame bg-card mx-auto max-w-md p-8 text-center sm:p-10">
          <div className="flex justify-center">
            <div className="bg-destructive/10 flex h-16 w-16 items-center justify-center rounded-2xl">
              <Sparkles className="text-destructive h-7 w-7" />
            </div>
          </div>
          <h1 className="mt-8 text-4xl font-bold tracking-tight">Something went wrong</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            We encountered an unexpected error during authentication.
          </p>
          {error.digest && (
            <p className="text-muted-foreground mt-2 text-xs">
              Error ID: <code className="bg-muted rounded px-1">{error.digest}</code>
            </p>
          )}
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Try again
            </Button>
            <Button asChild>
              <Link href="/login">Back to login</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
