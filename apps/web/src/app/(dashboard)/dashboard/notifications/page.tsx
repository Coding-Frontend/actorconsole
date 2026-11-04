import Link from "next/link";
import { auth } from "@/lib/auth";
import { authenticatedServerFetch } from "@/lib/server-api";
import { redirect } from "next/navigation";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Bell } from "lucide-react";
import { MarkAllReadButton } from "@/components/dashboard/mark-all-read-button";
import { NotificationList, type NotificationItem } from "@/components/dashboard/notification-list";
import { Button } from "@/components/ui/button";
import { ItemsPerPageSelect } from "@/components/ui/items-per-page";
import { normalizePageSize } from "@/lib/page-size";
import {
  DashboardAsyncState,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-workbench";

function typeLabel(type: string) {
  return type
    .replace(/^apify:/i, "Apify · ")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    unread?: string;
    source?: string;
    type?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/notifications");
  const params = await searchParams;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  // Console enrichment is bounded to 100 records per page by the API.
  const limit = Math.min(100, normalizePageSize(params.limit));
  const unreadOnly = params.unread === "true";
  const source = ["actorconsole", "apify"].includes(params.source ?? "") ? params.source! : "all";
  const type = typeof params.type === "string" ? params.type.slice(0, 120) : "";

  let items: NotificationItem[] = [];
  let unread = 0;
  let total = 0;
  let fetchError = false;
  let availableTypes: string[] = [];
  try {
    const apiQuery = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (unreadOnly) apiQuery.set("unread", "true");
    if (source !== "all") apiQuery.set("source", source);
    if (type) apiQuery.set("type", type);
    const r = await authenticatedServerFetch(`/notifications?${apiQuery.toString()}`);
    if (r.ok) {
      const j = await r.json();
      items = j?.data?.items ?? [];
      unread = j?.data?.unread ?? 0;
      total = j?.data?.total ?? items.length;
      availableTypes = j?.data?.availableTypes ?? [];
    } else {
      fetchError = true;
    }
  } catch {
    fetchError = true;
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function pageHref(nextPage: number) {
    const search = new URLSearchParams();
    if (nextPage > 1) search.set("page", String(nextPage));
    if (limit !== 25) search.set("limit", String(limit));
    if (unreadOnly) search.set("unread", "true");
    if (source !== "all") search.set("source", source);
    if (type) search.set("type", type);
    const query = search.toString();
    return query ? `/dashboard/notifications?${query}` : "/dashboard/notifications";
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Workspace / Inbox"
        title="Notifications"
        breadcrumbs={[{ label: "Help" }, { label: "Notifications" }]}
        description={
          fetchError
            ? "Notifications could not be loaded. Try refreshing this page."
            : items.length === 0
              ? unreadOnly || source !== "all" || type
                ? "No notifications match the selected filters."
                : "No notifications for this workspace yet."
              : `${total} total${unread > 0 ? `, ${unread} unread` : ""}`
        }
        primaryAction={unread > 0 ? <MarkAllReadButton /> : undefined}
      />

      <form
        action="/dashboard/notifications"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4"
        aria-label="Filter notifications"
      >
        <input type="hidden" name="limit" value={limit} />
        <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs font-medium">
          Read status
          <select
            name="unread"
            defaultValue={unreadOnly ? "true" : ""}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All</option>
            <option value="true">Unread</option>
          </select>
        </label>
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs font-medium">
          Source
          <select
            name="source"
            defaultValue={source}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All sources</option>
            <option value="actorconsole">ActorConsole</option>
            <option value="apify">Apify</option>
          </select>
        </label>
        <label className="flex min-w-44 flex-[2] flex-col gap-1 text-xs font-medium">
          Event type
          <select
            name="type"
            defaultValue={type}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All events</option>
            {[...new Set([...availableTypes, ...(type ? [type] : [])])].map((value) => (
              <option key={value} value={value}>
                {typeLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" type="submit" className="min-h-11 sm:min-h-0">
          Apply filters
        </Button>
        {unreadOnly || source !== "all" || type ? (
          <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-0" asChild>
            <Link href="/dashboard/notifications">Clear</Link>
          </Button>
        ) : null}
      </form>

      <Panel variant="default" radius="panel" noPadding>
        <div className="flex items-center gap-2 border-b border-border/40 px-5 py-4">
          <Bell className="h-4 w-4 text-signal-orange" />
          <h3 className="text-base font-bold tracking-tight">All notifications</h3>
          {unread > 0 && <Badge className="ml-auto">{unread} unread</Badge>}
        </div>

        {fetchError ? (
          <DashboardAsyncState
            status="error"
            title="Notifications could not be loaded"
            description="Refresh the page to try again."
            className="m-4 sm:m-5"
          />
        ) : items.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              title="No notifications"
              description={
                unreadOnly || source !== "all" || type
                  ? "No notifications match these filters. Try another event type or clear the filters."
                  : "You're all caught up. Actor status, publishing, and support updates will appear here."
              }
            />
          </div>
        ) : (
          <>
            <NotificationList items={items} />
            <div className="flex flex-col gap-3 border-t border-border/40 bg-muted/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {items.length} of {total} notifications · Page {Math.min(page, totalPages)}{" "}
                of {totalPages}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <form action="/dashboard/notifications" method="get">
                  {unreadOnly ? <input type="hidden" name="unread" value="true" /> : null}
                  {source !== "all" ? <input type="hidden" name="source" value={source} /> : null}
                  {type ? <input type="hidden" name="type" value={type} /> : null}
                  <ItemsPerPageSelect value={limit} label="Notifications per page" maxValue={100} />
                </form>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 sm:min-h-0"
                  disabled={page <= 1}
                  asChild={page > 1}
                >
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)}>Previous</Link>
                  ) : (
                    <span>Previous</span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  asChild={page < totalPages}
                >
                  {page < totalPages ? (
                    <Link href={pageHref(page + 1)}>Next</Link>
                  ) : (
                    <span>Next</span>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
