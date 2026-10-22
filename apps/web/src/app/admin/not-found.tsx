import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowLeft, Home } from "lucide-react";

export default function AdminNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20">
      <div className="mx-auto max-w-md text-center">
        <div className="flex justify-center">
          <div className="bg-destructive/10 flex h-16 w-16 items-center justify-center rounded-2xl">
            <ShieldCheck className="text-destructive h-7 w-7" />
          </div>
        </div>
        <h1 className="text-destructive mt-8 text-6xl font-bold tracking-tight">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          The admin page you&apos;re looking for doesn&apos;t exist.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="mr-1.5 h-4 w-4" />
              Go home
            </Link>
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
