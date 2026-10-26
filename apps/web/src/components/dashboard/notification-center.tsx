"use client";

import * as Popover from "@radix-ui/react-popover";
import { AlertCircle, Bell, ChevronRight, Inbox, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/api-base";
import { NotificationLink } from "@/components/dashboard/notification-link";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";
import { cn } from "@/lib/utils";

interface NotificationPreview {
  id: string;
  type: string;
  title: string;
  body: string | null;
  detailHref: string;
  readAt: string | null;
  createdAt: string;
  source: "actorconsole" | "apify";
}

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1_000));
  if (seconds < 60) return "Now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function NotificationCenter({ unreadNotifications = 0 }: { unreadNotifications?: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationPreview[]>([]);
  const [unread, setUnread] = useState(unreadNotifications);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasRequested = useRef(false);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => setUnread(unreadNotifications), [unreadNotifications]);

  const load = useCallback(async (workspaceChanged = false) => {
    const request = ++requestId.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (workspaceChanged) {
      setItems([]);
      setUnread(0);
    }
    hasRequested.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/notifications?page=1&limit=6`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted || request !== requestId.current) return;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not load notifications");
      }
      setItems(body.data.items ?? []);
      setUnread(Number(body.data.unread) || 0);
    } catch (loadError) {
      if (controller.signal.aborted || request !== requestId.current) return;
      hasRequested.current = false;
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications");
    } finally {
      if (!controller.signal.aborted && request === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { controllerRef.current?.abort(); };
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    const workspaceChanged = () => void load(true);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, workspaceChanged);
    window.addEventListener(DASHBOARD_STATUS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, workspaceChanged);
      window.removeEventListener(DASHBOARD_STATUS_CHANGED_EVENT, refresh);
    };
  }, [load]);

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && !hasRequested.current) void load();
  }

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0 ? `${unread} unread workspace notifications` : "Workspace notifications"
          }
          className="workbench-control border-border bg-card text-muted-foreground hover:border-signal-blue/50 hover:bg-accent hover:text-foreground focus-visible:ring-ring relative inline-flex h-9 w-9 items-center justify-center rounded-sm border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="bg-signal-orange text-ink border-background absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 px-1 font-mono text-[9px] font-bold leading-none shadow-sm">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="border-border bg-popover text-popover-foreground z-50 w-[min(calc(100vw-2rem),26rem)] overflow-hidden rounded-md border shadow-2xl outline-none"
        >
          <div className="border-border/70 flex items-center gap-3 border-b px-4 py-3.5">
            <div className="bg-signal-orange/10 text-signal-orange flex h-8 w-8 items-center justify-center rounded-sm">
              <Inbox className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Workspace inbox</p>
              <p className="text-muted-foreground text-[11px]">
                {unread > 0
                  ? `${unread} notification${unread === 1 ? "" : "s"} need review`
                  : "No unread notifications"}
              </p>
            </div>
            {loading ? <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" /> : null}
          </div>

          <div className="max-h-[min(28rem,calc(100vh-10rem))] overflow-y-auto">
            {error ? (
              <div className="flex items-start gap-3 px-4 py-6">
                <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Notifications are unavailable</p>
                  <p className="text-muted-foreground mt-1 text-xs">{error}</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="text-signal-blue mt-2 text-xs font-medium hover:underline"
                  >
                    Try again
                  </button>
                </div>
              </div>
            ) : !loading && items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bell className="text-muted-foreground/40 mx-auto h-7 w-7" />
                <p className="mt-3 text-sm font-medium">You’re all caught up</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Actor status, publishing, and support updates will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-border/60 divide-y">
                {items.map((item) => (
                  <div key={item.id}>
                    <NotificationLink
                      id={item.id}
                      href={item.detailHref}
                      unread={!item.readAt}
                      onNavigate={() => setOpen(false)}
                    >
                      <div
                        className={cn(
                          "hover:bg-accent/45 group relative flex gap-3 px-4 py-3.5 transition-colors",
                          !item.readAt && "bg-signal-orange/[0.035]",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1 h-2 w-2 shrink-0 rounded-full",
                            item.readAt
                              ? "bg-border"
                              : "bg-signal-orange ring-signal-orange/10 ring-4",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <p className="line-clamp-1 flex-1 text-sm font-medium leading-5">
                              {item.title}
                            </p>
                            <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                              {relativeTime(item.createdAt)}
                            </span>
                          </div>
                          {item.body ? (
                            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-5">
                              {item.body}
                            </p>
                          ) : null}
                          <p className="text-muted-foreground/70 mt-1.5 text-[10px] uppercase tracking-[0.12em]">
                            {item.source === "apify" ? "Apify Console" : "ActorConsole"}
                          </p>
                        </div>
                        <ChevronRight className="text-muted-foreground/40 mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </NotificationLink>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-border/70 bg-muted/20 border-t p-2">
            <Popover.Close asChild>
              <Link
                href="/dashboard/notifications"
                className="hover:bg-accent focus-visible:ring-ring flex h-9 items-center justify-center gap-2 rounded-sm text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2"
              >
                View all notifications
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Popover.Close>
          </div>
          <Popover.Arrow className="fill-border" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
