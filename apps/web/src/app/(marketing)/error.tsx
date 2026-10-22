"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, Home, RefreshCw } from "lucide-react";

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
      <div className="mx-auto max-w-md text-center">
        <div className="flex justify-center">
          <div className="bg-signal-orange/10 flex h-16 w-16 items-center justify-center rounded-2xl">
            <Sparkles className="text-signal-orange h-7 w-7" />
          </div>
        </div>
        <h1 className="mt-8 text-4xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          We encountered an unexpected error. Our team has been notified.
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
            <Link href="/">
              <Home className="mr-1.5 h-4 w-4" />
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
