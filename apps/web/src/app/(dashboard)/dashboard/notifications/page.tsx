import Link from "next/link";
import { auth } from "@/lib/auth";
import { authenticatedServerFetch } from "@/lib/server-api";
import { redirect } from "next/navigation";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Bell, Bot, Calendar, DollarSign, Shield, Info, ArrowRight } from "lucide-react";
import { MarkAllReadButton } from "@/components/dashboard/mark-all-read-button";
import { NotificationLink } from "@/components/dashboard/notification-link";
import { Button } from "@/components/ui/button";
import { ItemsPerPageSelect } from "@/components/ui/items-per-page";
import {
  DashboardAsyncState,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-workbench";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  detailHref: string;
  readAt: string | null;
  createdAt: string;
  source?: "actorconsole" | "apify";
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  review: {
    icon: <Bot className="h-3.5 w-3.5" />,
    color: "bg-signal-orange/10 text-signal-orange",
  },
  schedule: {
    icon: <Calendar className="h-3.5 w-3.5" />,
    color: "bg-signal-blue/10 text-signal-blue",
  },
  revenue: {
    icon: <DollarSign className="h-3.5 w-3.5" />,
    color: "bg-signal-green/10 text-signal-green",
  },
  billing: {
    icon: <DollarSign className="h-3.5 w-3.5" />,
    color: "bg-signal-orange/10 text-signal-orange",
  },
  security: {
    icon: <Shield className="h-3.5 w-3.5" />,
    color: "bg-destructive/10 text-destructive",
  },
  apify: {
    icon: <Bell className="h-3.5 w-3.5" />,
    color: "bg-signal-orange/10 text-signal-orange",
  },
};

function getTypeConfig(type: string) {
  if (type.toLowerCase().startsWith("apify:")) return TYPE_CONFIG.apify;
  return (
    TYPE_CONFIG[type.toLowerCase()] ?? {
      icon: <Info className="h-3.5 w-3.5" />,
      color: "bg-muted text-muted-foreground",
    }
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function groupByTime(items: NotificationItem[]): Record<string, NotificationItem[]> {
  const groups: Record<string, NotificationItem[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const item of items) {
    const d = new Date(item.createdAt);
    let key: string;
    if (d >= today) key = "Today";
    else if (d >= yesterday) key = "Yesterday";
    else if (d >= weekAgo) key = "This week";
    else key = "Older";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

const TIME_ORDER = ["Today", "Yesterday", "This week", "Older"];

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
  const requestedLimit = Number(params.limit ?? 25);
  const limit = [25, 50, 100].includes(requestedLimit) ? requestedLimit : 25;
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

  const grouped = groupByTime(items);
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
          items.length === 0
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
        className="border-border bg-card flex flex-wrap items-end gap-3 rounded-md border p-4"
        aria-label="Filter notifications"
      >
        <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs font-medium">
          Read status
          <select
            name="unread"
            defaultValue={unreadOnly ? "true" : ""}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
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
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
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
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">All events</option>
            {[...new Set([...availableTypes, ...(type ? [type] : [])])].map((value) => (
              <option key={value} value={value}>
                {typeLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" type="submit">
          Apply filters
        </Button>
        {unreadOnly || source !== "all" || type ? (
          <Button size="sm" variant="ghost" asChild>
            <Link href="/dashboard/notifications">Clear</Link>
          </Button>
        ) : null}
      </form>

      <Panel variant="default" radius="panel" noPadding>
        <div className="border-border/40 flex items-center gap-2 border-b px-5 py-4">
          <Bell className="text-signal-orange h-4 w-4" />
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
            <div className="divide-border/30 divide-y">
              {TIME_ORDER.filter((key) => grouped[key]?.length).map((timeKey) => (
                <div key={timeKey}>
                  <div className="text-muted-foreground/50 px-5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider">
                    {timeKey}
                  </div>
                  {grouped[timeKey].map((n) => {
                    const typeCfg = getTypeConfig(n.type);

                    const inner = (
                      <div
                        className={`flex items-start gap-4 px-5 py-4 transition-colors ${
                          !n.readAt ? "bg-signal-orange/[0.02]" : ""
                        } hover:bg-accent/30 cursor-pointer`}
                      >
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${typeCfg.color}`}
                        >
                          {typeCfg.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-sm font-medium">{n.title}</p>
                              {n.source === "apify" && (
                                <Badge variant="outline" className="shrink-0 text-[9px] uppercase">
                                  Apify
                                </Badge>
                              )}
                              {!n.readAt && (
                                <span className="bg-signal-orange h-1.5 w-1.5 shrink-0 rounded-full" />
                              )}
                            </div>
                            <span className="text-muted-foreground/50 shrink-0 text-[10px]">
                              {formatRelativeTime(n.createdAt)}
                            </span>
                          </div>
                          {n.body && (
                            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed">
                              {n.body}
                            </p>
                          )}
                          <span className="text-signal-orange/70 hover:text-signal-orange mt-1 inline-flex items-center gap-0.5 text-[10px]">
                            View notification
                            <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    );

                    return (
                      <NotificationLink key={n.id} id={n.id} href={n.detailHref} unread={!n.readAt}>
                        {inner}
                      </NotificationLink>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="border-border/40 bg-muted/10 flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs">
                Showing {items.length} of {total} notifications · Page {Math.min(page, totalPages)}{" "}
                of {totalPages}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <form action="/dashboard/notifications" method="get">
                  {unreadOnly ? <input type="hidden" name="unread" value="true" /> : null}
                  {source !== "all" ? <input type="hidden" name="source" value={source} /> : null}
                  {type ? <input type="hidden" name="type" value={type} /> : null}
                  <ItemsPerPageSelect value={limit} label="Notifications per page" />
                </form>
                <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
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
