import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ActorMark } from "@/components/brand/actor-mark";
import { Home } from "lucide-react";
import { PublicGridSection } from "@/components/marketing/public-grid-section";

export default function MarketingNotFound() {
  return (
    <PublicGridSection frameClassName="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        <div className="flex justify-center">
          <ActorMark size={64} />
        </div>
        <h1 className="text-signal-orange mt-8 text-6xl font-bold tracking-tight">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="mr-1.5 h-4 w-4" />
              Go home
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </PublicGridSection>
  );
}
