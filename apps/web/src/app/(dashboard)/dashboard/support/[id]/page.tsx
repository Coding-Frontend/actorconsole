import { auth } from "@/lib/auth";
import { authenticatedServerFetch } from "@/lib/server-api";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TicketReplyBox } from "@/components/dashboard/ticket-reply-box";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-signal-blue/10 text-signal-blue",
  PENDING: "bg-signal-orange/10 text-signal-orange",
  RESPONDED: "bg-signal-blue/10 text-signal-blue",
  RESOLVED: "bg-signal-green/10 text-signal-green",
  CLOSED: "bg-muted text-muted-foreground",
};

interface Message {
  id: string;
  authorId: string | null;
  authorType: "USER" | "ADMIN" | "SYSTEM";
  body: string;
  attachments: any;
  createdAt: string;
}

interface Ticket {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  userId: string;
  user: { id: string; email: string; name: string | null };
  assignedTo: { id: string; email: string; name: string | null } | null;
  actor: { id: string; title: string | null; actorName: string; apifyActorId: string } | null;
  messages: Message[];
  messagePage?: number;
  messageLimit?: number;
  messageTotal?: number;
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ messagePage?: string; messageLimit?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const requestedMessagePage = Number(query.messagePage ?? 1);
  const messagePage =
    Number.isFinite(requestedMessagePage) && requestedMessagePage > 0
      ? Math.floor(requestedMessagePage)
      : 1;
  const requestedMessageLimit = Number(query.messageLimit ?? 50);
  const messageLimit = [25, 50, 100].includes(requestedMessageLimit) ? requestedMessageLimit : 50;

  let ticket: Ticket | null = null;
  let fetchError = false;
  let response: Response | null = null;
  try {
    response = await authenticatedServerFetch(
      `/tickets/${encodeURIComponent(id)}?messagePage=${messagePage}&messageLimit=${messageLimit}`,
    );
    if (response.ok) {
      const j = await response.json();
      ticket = j?.data ?? null;
    } else {
      fetchError = true;
    }
  } catch {
    fetchError = true;
  }

  if (response?.status === 404) notFound();
  if (response?.status === 403) redirect("/dashboard/support");

  if (!ticket) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/support">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <p className="text-muted-foreground text-sm">
          {fetchError
            ? "The ticket could not be loaded. Refresh the page to try again."
            : "Ticket not available."}
        </p>
      </div>
    );
  }

  const closed = ticket.status === "CLOSED" || ticket.status === "RESOLVED";

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context={`Help / Support / AL-${ticket.number}`}
        title={ticket.subject}
        description={`Opened by ${ticket.user.name ?? ticket.user.email} · ${ticket.category} · ${ticket.priority}${ticket.assignedTo ? ` · Assigned to ${ticket.assignedTo.name ?? ticket.assignedTo.email}` : ""}`}
        status={
          <span
            className={`inline-flex items-center rounded-sm px-2 py-1 text-xs font-medium ${STATUS_STYLES[ticket.status] ?? ""}`}
          >
            {ticket.status}
          </span>
        }
        secondaryActions={[
          {
            label: "Back to tickets",
            href: "/dashboard/support",
            icon: <ArrowLeft className="h-3.5 w-3.5" />,
          },
        ]}
      />

      {ticket.actor ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">
                Related Actor
              </p>
              <p className="mt-1 text-sm font-medium">
                {ticket.actor.title ?? ticket.actor.actorName}
              </p>
              <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                {ticket.actor.apifyActorId}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/actors/${encodeURIComponent(ticket.actor.apifyActorId)}`}>
                View Actor
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ticket.messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.authorType === "ADMIN" ? "bg-signal-blue/[0.04]" : ""} rounded-md p-3`}
            >
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <Badge variant={m.authorType === "ADMIN" ? "default" : "secondary"}>
                    {m.authorType}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}

          {(ticket.messageTotal ?? ticket.messages.length) > messageLimit ? (
            <div className="border-border/50 flex items-center justify-between border-t pt-3 text-sm">
              {messagePage > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/dashboard/support/${encodeURIComponent(id)}?messagePage=${messagePage - 1}&messageLimit=${messageLimit}`}
                  >
                    Newer messages
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground text-xs">
                Page {messagePage} of{" "}
                {Math.max(1, Math.ceil((ticket.messageTotal ?? 0) / messageLimit))}
              </span>
              {messagePage < Math.ceil((ticket.messageTotal ?? 0) / messageLimit) ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/dashboard/support/${encodeURIComponent(id)}?messagePage=${messagePage + 1}&messageLimit=${messageLimit}`}
                  >
                    Older messages
                  </Link>
                </Button>
              ) : (
                <span />
              )}
            </div>
          ) : null}

          {closed ? (
            <p className="bg-muted/40 text-muted-foreground rounded-md p-3 text-sm">
              This ticket is {ticket.status.toLowerCase()}. Open a new ticket if you need more help.
            </p>
          ) : (
            <TicketReplyBox ticketId={ticket.id} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
