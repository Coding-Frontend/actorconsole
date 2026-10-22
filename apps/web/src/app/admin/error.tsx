"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldCheck, RefreshCw, ArrowLeft } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20">
      <div className="mx-auto max-w-md text-center">
        <div className="flex justify-center">
          <div className="bg-destructive/10 flex h-16 w-16 items-center justify-center rounded-2xl">
            <ShieldCheck className="text-destructive h-7 w-7" />
          </div>
        </div>
        <h1 className="mt-8 text-4xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          An unexpected error occurred. Our team has been notified.
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
            <Link href="/admin">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
