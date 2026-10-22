import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { formatDate } from "@/lib/utils";
import { TicketControls } from "@/components/admin/ticket-controls";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TicketReplyComposer } from "@/components/admin/ticket-reply-composer";
import { AdminApiError, AdminDetailError } from "@/components/admin/admin-pagination";

interface Admin {
  id: string;
  email: string;
  name: string | null;
}

interface Message {
  id: string;
  authorId: string | null;
  authorType: "USER" | "ADMIN" | "SYSTEM";
  body: string;
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
}

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [ticketRes, usersRes] = await Promise.all([
    api<Ticket>(`/admin/support/${encodeURIComponent(id)}`),
    api<{ items: any[] }>("/admin/users", { params: { role: "ADMIN", limit: 100 } }),
  ]);
  if (!ticketRes.ok) {
    if (ticketRes.status === 404) notFound();
    return (
      <AdminDetailError
        title="Support ticket unavailable"
        message={ticketRes.error.message}
        backHref="/admin/support"
        backLabel="Back to support tickets"
      />
    );
  }
  const ticket = ticketRes.data;

  let admins: Admin[] = [];
  if (usersRes.ok) {
    admins = usersRes.data.items
      .filter((u) => u.role === "ADMIN" || u.role === "SUPER_ADMIN")
      .map((u) => ({ id: u.id, email: u.email, name: u.name }));
  }
  const superRes = await api<{ items: any[] }>("/admin/users", {
    params: { role: "SUPER_ADMIN", limit: 100 },
  });
  if (superRes.ok) {
    for (const u of superRes.data.items) {
      if (!admins.find((a) => a.id === u.id)) {
        admins.push({ id: u.id, email: u.email, name: u.name });
      }
    }
  }
  const assigneeErrors = [
    !usersRes.ok ? usersRes.error.message : null,
    !superRes.ok ? superRes.error.message : null,
  ].filter((message): message is string => Boolean(message));

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/support">
            <ArrowLeft className="mr-1 h-4 w-4" /> All tickets
          </Link>
        </Button>
      </div>
      <PageHeader
        title={`AL-${ticket.number} — ${ticket.subject}`}
        description={`Opened by ${ticket.user.name ?? ticket.user.email} · ${ticket.category}`}
      />
      {assigneeErrors.length ? (
        <AdminApiError
          message={`The assignee directory is incomplete: ${assigneeErrors.join(" · ")}`}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thread ({ticket.messages.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ticket.messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 rounded-md p-3 ${
                  m.authorType === "ADMIN" ? "bg-signal-blue/[0.04]" : ""
                }`}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">
                      {m.authorType === "ADMIN"
                        ? "Support"
                        : m.authorType === "SYSTEM"
                          ? "System"
                          : (ticket.user.name ?? "User")}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {m.authorType}
                    </Badge>
                    <span className="text-muted-foreground text-[10px]">
                      {formatDate(m.createdAt, { withTime: true })}
                    </span>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            <TicketReplyComposer ticketId={ticket.id} closed={ticket.status === "CLOSED"} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {ticket.actor ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related Actor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium">
                    {ticket.actor.title ?? ticket.actor.actorName}
                  </p>
                  <p className="text-muted-foreground mt-1 font-mono text-xs">
                    {ticket.actor.apifyActorId}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/actors/${encodeURIComponent(ticket.actor.id)}`}>
                    Open Actor
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketControls
                ticketId={ticket.id}
                currentStatus={ticket.status}
                currentPriority={ticket.priority}
                currentAssigneeId={ticket.assignedTo?.id ?? null}
                admins={admins}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
