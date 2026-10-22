import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { api } from "@/lib/admin/server-api";
import { workspaceSections, type AdminWorkspaceData } from "@/lib/admin/workspace-sections";
import { PageHeader } from "@/components/admin/page-header";
import {
  AdminDetailError,
  AdminPagination,
  AdminApiError,
} from "@/components/admin/admin-pagination";
import { MimicUserButton } from "@/components/admin/mimic-user-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FinancialAnalyticsPage } from "@/components/dashboard/financial-analytics-page";
import type { UsageCostsPayload } from "@/components/dashboard/usage-costs-analytics";
import { formatDate } from "@/lib/utils";

const labels: Record<string, string> = {
  actorName: "Actor",
  storeIsPublic: "Public",
  storeIsDeprecated: "Deprecated",
  publishReady: "Ready to publish",
  lastOperationalSyncAt: "Last synced",
  cronExpr: "Cron",
  dailyLimit: "Daily limit",
  "_count.actors": "Actors",
  readAt: "Read at",
  createdAt: "Created",
  lastRunAt: "Last run",
  nextRunAt: "Next run",
  currentPeriodEnd: "Period end",
  cancelAtPeriodEnd: "Cancels at period end",
  keyPreview: "Key preview",
};

function label(field: string) {
  return (
    labels[field] ??
    field.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())
  );
}

function valueFor(row: Record<string, unknown>, field: string): unknown {
  return field
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined,
      row,
    );
}

function display(value: unknown, field: string) {
  if (value === null || value === undefined) return field === "readAt" ? "Unread" : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (field.endsWith("At") || field === "currentPeriodEnd")
    return formatDate(String(value), { withTime: true });
  return String(value);
}

export default async function AdminUserWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, workspaceId } = await params;
  const query = await searchParams;
  const section =
    workspaceSections.find((item) => item.id === query.section) ?? workspaceSections[0];
  const analyticsKind =
    section.id === "usage" || section.id === "costs" || section.id === "revenue"
      ? section.id
      : null;
  const base = `/admin/users/${encodeURIComponent(id)}/workspaces/${encodeURIComponent(workspaceId)}`;
  const collection = section.columns.length ? section.id : "actors";
  const response = await api<AdminWorkspaceData>(base, {
    params: { section: collection, page: typeof query.page === "string" ? query.page : "1" },
  });
  if (!response.ok) {
    if (response.status === 404) notFound();
    return (
      <AdminDetailError
        title="Workspace unavailable"
        message={response.error.message}
        backHref={`/admin/users/${id}`}
        backLabel="Back to user"
      />
    );
  }
  const { workspace, items, total, page, limit } = response.data;
  const analyticsParams: Record<string, string> = {};
  for (const key of ["from", "to", "actors", "granularity", "mode", "compare", "day", "table"]) {
    if (typeof query[key] === "string")
      analyticsParams[key === "actors" ? "actorIds" : key] = query[key];
  }
  const analytics = analyticsKind
    ? await api<UsageCostsPayload>(`${base}/analytics/${analyticsKind}`, {
        params: analyticsParams,
      })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={workspace.name}
        description={`Workspace belonging to ${workspace.user.name || workspace.user.email}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/users/${id}`}>
                <ArrowLeft className="h-4 w-4" /> Back to user
              </Link>
            </Button>
            <MimicUserButton user={workspace.user} workspaceId={workspace.id} />
          </div>
        }
      />
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="text-signal-blue h-5 w-5" />
              <span className="font-medium">{workspace.name}</span>
              <Badge variant="outline">{workspace.plan}</Badge>
              {workspace.isDefault ? <Badge variant="secondary">Default workspace</Badge> : null}
            </div>
            <p className="text-muted-foreground break-all text-xs">
              {workspace.user.email} · {workspace.slug} · Created {formatDate(workspace.createdAt)}
            </p>
            {workspace.industry || workspace.website ? (
              <p className="text-muted-foreground break-all text-xs">
                {[workspace.industry, workspace.website].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            {workspace._count.actors} Actors · {workspace._count.bulkPublishSchedules} schedules ·{" "}
            {workspace._count.notifications} notifications
          </p>
        </CardContent>
      </Card>

      <nav aria-label="Workspace sections" className="flex flex-wrap gap-2">
        {workspaceSections.map((item) => (
          <Button
            key={item.id}
            variant={item.id === section.id ? "default" : "outline"}
            size="sm"
            asChild
          >
            <Link
              href={`${base}?section=${item.id}`}
              aria-current={item.id === section.id ? "page" : undefined}
            >
              {item.label}
              {"count" in item ? (
                <span className="font-mono text-[10px] opacity-75">
                  {workspace._count[item.count] ?? 0}
                </span>
              ) : null}
            </Link>
          </Button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display-tight text-2xl">{section.label}</h2>
        <MimicUserButton
          user={workspace.user}
          workspaceId={workspace.id}
          dashboardPath={section.dashboard}
          label="Open this page as user"
        />
      </div>

      {analyticsKind && analytics ? (
        analytics.ok ? (
          <FinancialAnalyticsPage
            key={analyticsKind}
            kind={analyticsKind}
            payload={analytics.data}
            actorHrefPrefix="/admin/actors"
            connectionHref={`${base}?section=apify`}
          />
        ) : (
          <AdminApiError message={analytics.error.message} />
        )
      ) : null}

      {section.id === "apify" ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            {workspace.apifyTokens.length ? (
              workspace.apifyTokens.map((connection, index) => (
                <dl key={index} className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(connection).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-muted-foreground text-xs">{label(key)}</dt>
                      <dd className="mt-1 break-words text-sm">{display(value, key)}</dd>
                    </div>
                  ))}
                </dl>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No Apify account is connected to this workspace.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section.id === "preferences" ? (
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            {Object.entries(
              workspace.notificationPreference ?? {
                marketing: true,
                product: true,
                billing: true,
                security: true,
              },
            ).map(([key, enabled]) => (
              <div key={key} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm">{label(key)}</span>
                <Badge variant={enabled ? "success" : "secondary"}>
                  {enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {section.columns.length ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {section.label} in {workspace.name}
              </caption>
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  {section.columns.map((field) => (
                    <th key={field} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">
                      {label(field)}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((row) => {
                  const detailHref =
                    section.id === "actors"
                      ? `/admin/actors/${row.id}`
                      : section.id === "subscriptions"
                        ? `/admin/subscriptions/${row.id}`
                        : section.id === "support"
                          ? `/admin/tickets/${row.id}`
                          : null;
                  return (
                    <tr key={String(row.id)} className="hover:bg-muted/30">
                      {section.columns.map((field) => (
                        <td key={field} className="max-w-sm px-4 py-3 align-top">
                          <span
                            className={
                              field === "body" || field === "error"
                                ? "whitespace-pre-wrap break-words"
                                : "whitespace-nowrap"
                            }
                          >
                            {display(valueFor(row, field), field)}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-3 align-top">
                        {detailHref ? (
                          <Link
                            className="text-signal-blue whitespace-nowrap underline underline-offset-4"
                            href={detailHref}
                          >
                            View details
                          </Link>
                        ) : section.id === "schedules" ? (
                          <ScheduleDetails row={row} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!items.length ? (
            <p className="text-muted-foreground p-6 text-sm">
              No {section.label.toLowerCase()} in this workspace.
            </p>
          ) : null}
          <div className="border-t p-4">
            <AdminPagination
              path={base}
              page={page}
              total={total}
              limit={limit}
              query={{ section: section.id }}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User account tools</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/users/${id}`}>Profile and account controls</Link>
          </Button>
          <MimicUserButton
            user={workspace.user}
            workspaceId={workspace.id}
            dashboardPath="/dashboard/data-export"
            label="Data export as user"
          />
          <MimicUserButton
            user={workspace.user}
            workspaceId={workspace.id}
            dashboardPath="/dashboard/account"
            label="Account settings as user"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleDetails({ row }: { row: Record<string, unknown> }) {
  const runs = row.runs as Array<Record<string, unknown>>;
  return (
    <details className="min-w-40">
      <summary className="text-signal-blue cursor-pointer">Latest run</summary>
      {runs?.length ? (
        runs.map((run, index) => (
          <dl key={index} className="mt-2 space-y-1 text-xs">
            {Object.entries(run).map(([key, value]) => (
              <div key={key}>
                <dt className="text-muted-foreground">{label(key)}</dt>
                <dd>{display(value, key)}</dd>
              </div>
            ))}
          </dl>
        ))
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">This schedule has not run yet.</p>
      )}
    </details>
  );
}
