import { ArrowLeft, Bell, ExternalLink, LifeBuoy, Store, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { authenticatedServerFetch } from "@/lib/server-api";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { NotificationDetailActions } from "@/components/dashboard/notification-detail-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";

interface NotificationDetail {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  source: "actorconsole" | "apify";
  actionKind: "clear-maintenance" | "clear-deprecated" | "support-ticket" | "review";
  actionNeeded: string;
  actor: {
    id: string;
    apifyActorId: string;
    username: string;
    actorName: string;
    title: string | null;
    description: string | null;
    currentImageUrl: string | null;
    storeIsPublic: boolean | null;
    storeIsDeprecated: boolean | null;
    storeNotice: string | null;
    storeStatusSyncedAt: string | null;
    href: string;
  } | null;
  ticket: {
    id: string;
    number: number;
    subject: string;
    status: string;
    priority: string;
    category: string;
    lastReplyAt: string | null;
    updatedAt: string;
    href: string;
  } | null;
  actions: Array<{
    id: "clear-maintenance" | "clear-deprecated" | "open-ticket";
    label: string;
    description: string;
  }>;
}

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/dashboard/notifications/${id}`)}`);
  }

  let notification: NotificationDetail | null = null;
  let loadError = false;
  try {
    const response = await authenticatedServerFetch(`/notifications/${encodeURIComponent(id)}`);
    if (response.ok) notification = (await response.json())?.data ?? null;
    else loadError = true;
  } catch {
    loadError = true;
  }

  if (!notification) {
    return (
      <div className="space-y-6">
        <DashboardPageHeader
          context="Workspace / Inbox"
          title="Notification unavailable"
          description={
            loadError
              ? "This notification could not be loaded. It may have expired in Apify Console or belong to another workspace."
              : "This notification no longer exists."
          }
          secondaryActions={[
            {
              label: "Back to notifications",
              href: "/dashboard/notifications",
              icon: <ArrowLeft className="h-3.5 w-3.5" />,
            },
          ]}
        />
        <Panel className="p-8">
          <EmptyState
            title="Notification not found"
            description="Return to the inbox to review the notifications currently available for this workspace."
            action={{ label: "Open inbox", href: "/dashboard/notifications" }}
          />
        </Panel>
      </div>
    );
  }

  const maintenance = notification.actor?.storeNotice === "UNDER_MAINTENANCE";
  const deprecated = notification.actor?.storeIsDeprecated === true;

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Workspace / Inbox / Notification"
        title={notification.title}
        description={`${notification.source === "apify" ? "Apify Console" : "ActorConsole"} · ${formattedDate(notification.createdAt)}`}
        secondaryActions={[
          {
            label: "Back to notifications",
            href: "/dashboard/notifications",
            icon: <ArrowLeft className="h-3.5 w-3.5" />,
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.55fr)]">
        <div className="space-y-6">
          <Panel variant="default" radius="panel" noPadding>
            <div className="border-border/60 flex items-start gap-4 border-b px-5 py-5 sm:px-6">
              <div className="bg-signal-orange/10 text-signal-orange flex h-10 w-10 shrink-0 items-center justify-center rounded-sm">
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {notification.source === "apify" ? "Apify Console" : "ActorConsole"}
                  </Badge>
                  {!notification.readAt ? <Badge>Unread</Badge> : null}
                </div>
                <p className="mt-3 text-base font-semibold">{notification.title}</p>
                {notification.body ? (
                  <p className="text-muted-foreground mt-2 whitespace-pre-wrap text-sm leading-6">
                    {notification.body}
                  </p>
                ) : null}
              </div>
            </div>
            {notification.link?.startsWith("https://") ? (
              <div className="px-5 py-4 sm:px-6">
                <Button variant="outline" size="sm" asChild>
                  <a href={notification.link} target="_blank" rel="noopener noreferrer">
                    Open source in Apify
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            ) : null}
          </Panel>

          <Panel variant="default" radius="panel" noPadding>
            <div className="border-border/60 flex items-center gap-3 border-b px-5 py-4 sm:px-6">
              <Wrench className="text-signal-orange h-4 w-4" />
              <h2 className="text-sm font-semibold">Action needed</h2>
            </div>
            <div className="space-y-4 px-5 py-5 sm:px-6">
              <p className="text-muted-foreground text-sm leading-6">{notification.actionNeeded}</p>
              {notification.actions.map((action) => (
                <div key={action.id} className="border-border/60 bg-muted/15 rounded-sm border p-3">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {action.description}
                  </p>
                </div>
              ))}
              {notification.ticket ? (
                <Button variant="outline" asChild>
                  <Link href={notification.ticket.href}>
                    <LifeBuoy className="mr-2 h-4 w-4" />
                    Open support ticket
                  </Link>
                </Button>
              ) : null}
              <NotificationDetailActions
                notificationId={notification.id}
                unread={!notification.readAt}
                actorId={notification.actor?.id ?? null}
                actions={notification.actions}
              />
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          {notification.actor ? (
            <Panel variant="default" radius="panel" noPadding>
              <div className="border-border/60 flex items-center gap-3 border-b px-5 py-4">
                <Store className="text-signal-blue h-4 w-4" />
                <h2 className="text-sm font-semibold">Referenced Actor</h2>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <p className="text-base font-semibold">
                    {notification.actor.title ?? notification.actor.actorName}
                  </p>
                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    {notification.actor.apifyActorId}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={maintenance ? "default" : "outline"}>
                    {maintenance ? "Under maintenance" : "No maintenance notice"}
                  </Badge>
                  <Badge variant={deprecated ? "destructive" : "outline"}>
                    {deprecated ? "Deprecated" : "Active"}
                  </Badge>
                  <Badge variant="outline">
                    {notification.actor.storeIsPublic ? "Published" : "Private"}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={notification.actor.href}>View Actor</Link>
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel className="p-5">
              <p className="text-sm font-semibold">Actor context unavailable</p>
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                Synchronize the workspace inventory if this notification refers to an Actor that is
                not yet tracked in ActorConsole.
              </p>
            </Panel>
          )}

          {notification.ticket ? (
            <Panel variant="default" radius="panel" noPadding>
              <div className="border-border/60 flex items-center gap-3 border-b px-5 py-4">
                <LifeBuoy className="text-signal-green h-4 w-4" />
                <h2 className="text-sm font-semibold">Support ticket</h2>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">AL-{notification.ticket.number}</Badge>
                  <Badge>{notification.ticket.status}</Badge>
                  <Badge variant="outline">{notification.ticket.priority}</Badge>
                </div>
                <p className="text-sm font-medium">{notification.ticket.subject}</p>
                <p className="text-muted-foreground text-xs">
                  Updated {formattedDate(notification.ticket.updatedAt)}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={notification.ticket.href}>View conversation</Link>
                </Button>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
