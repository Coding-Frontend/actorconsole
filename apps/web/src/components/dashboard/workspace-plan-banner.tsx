"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { workspacePlanNotice, type WorkspacePlanUsage } from "@actorconsole/shared/plans";
import type { WorkspaceAccess } from "@actorconsole/shared/workspace-access";
import { API_BASE_URL } from "@/lib/api-base";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { Button } from "@/components/ui/button";

export function WorkspacePlanBanner({
  workspaceId,
  plan,
  currentUsage,
}: {
  workspaceId: string | null;
  plan: "FREE" | "PRO" | null;
  currentUsage?: WorkspaceAccess["usage"];
}) {
  const [loadedUsage, setUsage] = useState<
    (WorkspacePlanUsage & { monthlyUsersComplete?: boolean; checkedAt?: string | null }) | null
  >(null);
  useEffect(() => {
    setUsage(null);
    if (currentUsage !== undefined) return;
    if (!workspaceId || !plan) return;
    const controller = new AbortController();
    let requestId = 0;
    const load = async () => {
      const request = ++requestId;
      try {
        const response = await fetch(`${API_BASE_URL}/actors/plan-usage`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          headers: { "x-business-profile-id": workspaceId },
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!controller.signal.aborted && request === requestId) setUsage(body.data ?? null);
      } catch {
        /* The banner must not interrupt dashboard access. */
      }
    };
    void load();
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, load);
    return () => {
      controller.abort();
      window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, load);
    };
  }, [workspaceId, plan, currentUsage]);

  const usage = currentUsage === undefined ? loadedUsage : currentUsage;
  if (!usage) return null;
  const checkedAt = usage.checkedAt ? new Date(usage.checkedAt) : null;
  const checkedLabel =
    checkedAt && Number.isFinite(checkedAt.getTime())
      ? `${checkedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
      : null;
  const notice = workspacePlanNotice(usage);
  const exceeded = notice === "exceeded";
  return (
    <div className="border-border/80 shrink-0 border-t px-4 py-3">
      <div aria-label="Workspace plan usage" className="space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{plan === "PRO" ? "Pro" : "Free"} workspace usage</span>
          <Link
            href="/dashboard/billing"
            className="text-signal-orange shrink-0 underline underline-offset-2"
          >
            Manage plan
          </Link>
        </div>
        <dl className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <dt className="text-muted-foreground">Actors</dt>
            <dd className="font-medium tabular-nums">
              {usage.actorCount.toLocaleString("en-US")} / {usage.actorLimit ?? "Unlimited"}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <dt className="text-muted-foreground">Users (30 days)</dt>
            <dd className="font-medium tabular-nums">
              {usage.monthlyUsers === null
                ? "Not reported"
                : `${usage.monthlyUsersComplete === false ? "At least " : ""}${usage.monthlyUsers.toLocaleString("en-US")}`}{" "}
              / {usage.monthlyUserLimit ?? "Unlimited"}
            </dd>
          </div>
        </dl>
        <details className="text-muted-foreground">
          <summary className="focus-visible:ring-ring cursor-pointer rounded-sm py-1 focus-visible:outline-none focus-visible:ring-2">
            Usage details
          </summary>
          <p className="scroll-soft mt-1 max-h-28 overflow-y-auto text-xs leading-relaxed">
            Users are summed across your Apify actors for the past 30 days; the same person may
            count in more than one actor.
            {usage.monthlyUsersComplete === false
              ? " Some actors have not reported user counts yet."
              : null}
            {checkedLabel ? ` Last checked ${checkedLabel}.` : " Sync Apify to refresh usage."}
          </p>
        </details>
      </div>
      {notice ? (
        <div role="status" className="border-signal-orange/30 mt-2 space-y-2 border-t pt-2">
          <div>
            <p className="text-signal-orange text-xs font-semibold">
              {exceeded
                ? "Your workspace needs Pro"
                : "Your workspace is approaching the Free limits"}
            </p>
            <p className="scroll-soft text-muted-foreground mt-1 max-h-24 overflow-y-auto text-xs leading-relaxed">
              {exceeded ? (
                <>
                  {usage.actorLimitExceeded ? `${usage.actorCount} Apify actors` : null}
                  {usage.actorLimitExceeded && usage.monthlyUserLimitExceeded ? " and " : null}
                  {usage.monthlyUserLimitExceeded
                    ? `${usage.monthlyUsers?.toLocaleString("en-US")} reported users in the past 30 days`
                    : null}{" "}
                  exceed the Free plan. Upgrade to restore Overview, Actors, Activity, Publishing,
                  and reports. Keyword search and MCP connection remain available.
                </>
              ) : (
                <>
                  All features remain available. Free includes up to {usage.actorLimit} actors and{" "}
                  {usage.monthlyUserLimit} monthly users. Pro is required above either limit. Choose
                  monthly or yearly billing when you upgrade.
                </>
              )}
            </p>
          </div>
          <Button asChild size="sm" variant={exceeded ? "default" : "outline"}>
            <Link href="/dashboard/billing">
              {exceeded ? "Upgrade to Pro" : "View Pro options"}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
