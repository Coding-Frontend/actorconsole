"use client";
import Link from "next/link";
import type { WorkspaceAccess } from "@actorconsole/shared/workspace-access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader } from "./dashboard-workbench";

export function WorkspaceUpgradeScreen({
  access,
  error,
  refresh,
}: {
  access: WorkspaceAccess | null;
  error?: boolean;
  refresh: () => void;
}) {
  if (!access || error)
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <p>We couldn’t verify this workspace’s plan. Retry to restore access.</p>
          <Button onClick={refresh}>Retry workspace check</Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/billing">Manage billing</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/apify">Apify connection</Link>
          </Button>
        </CardContent>
      </Card>
    );
  const usage = access.usage;
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Your workspace needs Pro"
        context="Workspace / Plan limits"
        description="This workspace exceeds the Free allowance. Upgrade to restore your workspace dashboard and operational tools."
      />
      <Card>
        <CardHeader>
          <CardTitle>Workspace usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-sm">Apify actors</p>
              <p className="text-2xl font-semibold">
                {usage?.actorCount.toLocaleString() ?? "—"} / 50
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Users in the past 30 days</p>
              <p className="text-2xl font-semibold">
                {usage?.monthlyUsersComplete === false ? "At least " : ""}
                {usage?.monthlyUsers?.toLocaleString() ?? "Not reported"} / 500
              </p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            Free includes all features up to 50 actors and 500 monthly users. Pro removes both
            limits, with monthly or yearly billing. User counts are summed across actors and may
            include the same person more than once.
          </p>
          <p className="text-sm">
            Keyword search, MCP connection, support, documentation, billing, and connection settings
            remain available. MCP actor and reporting tools follow the same workspace limits.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard/billing">Upgrade to Pro</Link>
            </Button>
            <Button variant="outline" onClick={refresh}>
              Recheck workspace access
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/apify">Manage Apify connection</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-4 text-sm underline">
        <Link href="/dashboard/keywords">Keyword search</Link>
        <Link href="/dashboard/mcp">MCP connection</Link>
        <Link href="/dashboard/support">Support</Link>
        <Link href="/docs">Documentation</Link>
      </div>
    </div>
  );
}
