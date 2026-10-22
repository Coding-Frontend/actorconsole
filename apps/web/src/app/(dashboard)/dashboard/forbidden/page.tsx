import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { ShieldX, ArrowLeft } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20">
      <div className="mx-auto max-w-sm">
        <Panel variant="default" radius="panel" className="text-center">
          <div className="bg-destructive/10 mx-auto flex h-14 w-14 items-center justify-center rounded-xl">
            <ShieldX className="text-destructive h-6 w-6" />
          </div>
          <h1 className="text-destructive mt-6 text-5xl font-bold tracking-tight">403</h1>
          <h2 className="mt-3 text-lg font-semibold">Access denied</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            You don&apos;t have permission to access this page.
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
