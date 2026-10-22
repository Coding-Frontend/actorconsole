import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldX, Home } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center p-6">
      <div className="mx-auto max-w-md text-center">
        <div className="flex justify-center">
          <div className="bg-signal-orange/10 flex h-16 w-16 items-center justify-center rounded-2xl">
            <ShieldX className="text-signal-orange h-7 w-7" />
          </div>
        </div>
        <h1 className="text-signal-orange mt-8 text-6xl font-bold tracking-tight">403</h1>
        <h2 className="mt-4 text-xl font-semibold">Access denied</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          You don&apos;t have permission to access this page. If you think this is a mistake,
          contact support.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              Go home
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
