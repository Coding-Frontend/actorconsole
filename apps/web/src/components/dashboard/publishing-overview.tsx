"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  ALL_WORKSPACES_PUBLISHING_PATH,
  type PublishingOverviewPayload,
} from "@actorconsole/shared/default-dashboard";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL } from "@/lib/api-base";
import { navigateInApp } from "@/lib/client-navigation";

const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" }) : "—";
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");

export function PublishingOverview({ payload }: { payload: PublishingOverviewPayload }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function openWorkspace(id: string, path = "/dashboard/publishing") {
    if (pending) return;
    setPending(id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/account/business-profiles/${id}/select`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Workspace switch failed");
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
      navigateInApp(path);
    } catch {
      setError("Could not open the workspace. Try again.");
      setPending(null);
    }
  }
  const summary = payload.summary;
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="All Workspaces"
        title="Publishing overview"
        description={`Store visibility, publishing queues, and schedules across your ${payload.workspaces.length} workspaces.`}
        primaryAction={
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {(
              [
                ["Actors", summary.actors],
                ["Published in Store", summary.published],
                ["Private", summary.private],
                ["Active schedules", summary.activeSchedules],
              ] as const
            ).map(([name, value]) => (
              <div key={name}>
                <dt className="text-muted-foreground text-xs font-medium">{name}</dt>
                <dd className="mt-2 text-2xl font-semibold tabular-nums">
                  {value.toLocaleString("en-US")}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground mt-4 text-xs">
            Last synced Store visibility · {summary.unknown} actors with unknown visibility. Open a
            workspace to sync its inventory.
          </p>
        </CardContent>
      </Card>
      <section aria-labelledby="publishing-queue-title" className="space-y-2">
        <h2 id="publishing-queue-title" className="text-base font-semibold">
          Publishing queue
        </h2>
        <p className="text-muted-foreground text-sm">
          {summary.pending} pending · {summary.queuedPublished} published · {summary.failed} failed
          · {summary.blocked} blocked across {summary.schedules} schedules.
        </p>
        <p className="text-muted-foreground text-xs">
          Queue totals count schedule entries. An actor can appear in more than one schedule.
          Blocked includes Apify publication limits.
        </p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Publishing by workspace</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Store visibility and schedules by workspace</caption>
            <thead className="text-muted-foreground border-border border-b text-xs">
              <tr>
                {["Workspace", "Actors", "Published", "Private", "Unknown", "Schedules", ""].map(
                  (name) => (
                    <th key={name} scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                      {name || <span className="sr-only">Open workspace</span>}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {payload.workspaces.map((workspace) => (
                <tr key={workspace.id} className="border-border border-b last:border-0">
                  <th scope="row" className="px-3 py-3 text-left font-medium">
                    {workspace.name}
                  </th>
                  {[
                    workspace.actors,
                    workspace.published,
                    workspace.private,
                    workspace.unknown,
                    workspace.schedules,
                  ].map((value, index) => (
                    <td key={index} className="px-3 py-3 tabular-nums">
                      {value.toLocaleString("en-US")}
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending !== null}
                      aria-label={`Open publishing for ${workspace.name}`}
                      onClick={() => void openWorkspace(workspace.id)}
                    >
                      {pending === workspace.id ? "Opening…" : "Open publishing"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {payload.workspaces.length === 0 && (
            <p className="text-muted-foreground py-6 text-sm">
              Create a workspace to start tracking publishing.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Publishing schedules</CardTitle>
          <p className="text-muted-foreground text-xs">
            All schedules, including paused queues. Times shown in UTC.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {payload.schedules.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">
              No publishing schedules yet. Open a workspace’s publishing tools to create one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Publishing schedules across all workspaces</caption>
                <thead className="text-muted-foreground border-border border-b text-xs">
                  <tr>
                    {[
                      "Schedule / workspace",
                      "Status",
                      "Queue",
                      "Next run (UTC)",
                      "Last run",
                      "",
                    ].map((name) => (
                      <th key={name} scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                        {name || <span className="sr-only">Manage schedule</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.schedules.map((schedule) => (
                    <tr key={schedule.id} className="border-border border-b last:border-0">
                      <th scope="row" className="px-3 py-3 text-left font-medium">
                        {schedule.name}
                        <span className="text-muted-foreground mt-1 block text-xs font-normal">
                          {schedule.workspaceName}
                        </span>
                      </th>
                      <td className="px-3 py-3">
                        {schedule.enabled ? "Active" : "Paused"}
                        {schedule.quotaBlockedUntil && (
                          <span className="text-muted-foreground mt-1 block text-xs">
                            Quota blocked until {date(schedule.quotaBlockedUntil)}
                          </span>
                        )}
                      </td>
                      <td className="min-w-52 px-3 py-3 text-xs leading-5">
                        {schedule.actors} entries · {schedule.pending} pending ·{" "}
                        {schedule.published} published
                        <br />
                        {schedule.failed} failed · {schedule.blocked} blocked
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {schedule.enabled ? date(schedule.nextRunAt) : "Paused"}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {schedule.lastRun ? (
                          <>
                            {label(schedule.lastRun.status)} · {schedule.lastRun.publishedCount}{" "}
                            published
                            <span className="text-muted-foreground mt-1 block">
                              {date(schedule.lastRun.startedAt)}
                            </span>
                          </>
                        ) : (
                          "No runs yet"
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending !== null}
                          aria-label={`Manage ${schedule.name} in ${schedule.workspaceName}`}
                          onClick={() =>
                            void openWorkspace(
                              schedule.workspaceId,
                              "/dashboard/publishing/schedules",
                            )
                          }
                        >
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {payload.totalSchedules > payload.pageSize && (
            <nav
              aria-label="Publishing schedule pages"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-muted-foreground text-xs">
                Page {payload.page} of {Math.ceil(payload.totalSchedules / payload.pageSize)} ·{" "}
                {payload.totalSchedules} schedules
              </p>
              <div className="flex gap-2">
                {payload.page > 1 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`${ALL_WORKSPACES_PUBLISHING_PATH}?page=${payload.page - 1}`}>
                      Previous
                    </Link>
                  </Button>
                )}
                {payload.page * payload.pageSize < payload.totalSchedules && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`${ALL_WORKSPACES_PUBLISHING_PATH}?page=${payload.page + 1}`}>
                      Next
                    </Link>
                  </Button>
                )}
              </div>
            </nav>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent Store status changes</CardTitle>
          <p className="text-muted-foreground text-xs">
            Latest 20 operations across all workspaces. Open a workspace for its full history.
          </p>
        </CardHeader>
        <CardContent>
          {payload.operations.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">
              No Store status changes recorded yet.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {payload.operations.map((operation) => (
                <li
                  key={operation.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {label(operation.action)} · {operation.workspaceName}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {label(operation.status)} · {operation.succeededCount}/{operation.actorCount}{" "}
                      succeeded · {operation.failedCount} failed · {date(operation.createdAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending !== null}
                    aria-label={`View status change in ${operation.workspaceName}`}
                    onClick={() =>
                      void openWorkspace(
                        operation.workspaceId,
                        `/dashboard/publishing/schedules?view=status-changes&operation=${encodeURIComponent(operation.id)}`,
                      )
                    }
                  >
                    View
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
