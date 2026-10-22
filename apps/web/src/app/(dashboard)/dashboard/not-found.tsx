import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20">
      <div className="mx-auto max-w-sm text-center">
        <div className="flex justify-center">
          <div className="bg-signal-orange/10 flex h-14 w-14 items-center justify-center rounded-xl">
            <Sparkles className="text-signal-orange h-6 w-6" />
          </div>
        </div>
        <h1 className="text-signal-orange mt-6 text-5xl font-bold tracking-tight">404</h1>
        <h2 className="mt-3 text-lg font-semibold">Page not found</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          This dashboard page doesn&apos;t exist.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
