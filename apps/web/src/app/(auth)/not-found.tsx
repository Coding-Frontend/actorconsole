import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ActorMark } from "@/components/brand/actor-mark";
import { Home } from "lucide-react";

export default function AuthNotFound() {
  return (
    <div className="home-grid-section flex min-h-[calc(100dvh-4rem)] flex-1">
      <div className="home-grid-frame grid flex-1 place-items-center p-6">
        <div className="blueprint-frame bg-card mx-auto max-w-md p-8 text-center sm:p-10">
          <div className="flex justify-center">
            <ActorMark size={64} />
          </div>
          <h1 className="text-signal-orange mt-8 text-6xl font-bold tracking-tight">404</h1>
          <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <div className="mt-8">
            <Button asChild>
              <Link href="/">
                <Home className="mr-1.5 h-4 w-4" />
                Go home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
