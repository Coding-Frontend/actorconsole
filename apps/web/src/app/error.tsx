"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ActorMark } from "@/components/brand/actor-mark";
import { RotateCcw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mx-auto max-w-md text-center">
        <div className="flex justify-center">
          <ActorMark size={64} />
        </div>
        <h1 className="text-destructive mt-8 text-6xl font-bold tracking-tight">500</h1>
        <h2 className="mt-4 text-xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          An unexpected error occurred. Our team has been notified.
        </p>
        {error.digest && (
          <p className="text-muted-foreground/60 mt-2 font-mono text-xs">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              Go home
            </Link>
          </Button>
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
