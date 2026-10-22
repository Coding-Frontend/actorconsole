import { auth } from "@/lib/auth";
import { authenticatedServerFetch } from "@/lib/server-api";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, LifeBuoy } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemsPerPageSelect } from "@/components/ui/items-per-page";
import { normalizePageSize } from "@/lib/page-size";
import {
  DashboardAsyncState,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-workbench";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-signal-blue/10 text-signal-blue",
  PENDING: "bg-signal-orange/10 text-signal-orange",
  RESPONDED: "bg-signal-blue/10 text-signal-blue",
  RESOLVED: "bg-signal-green/10 text-signal-green",
  CLOSED: "bg-muted text-muted-foreground",
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground",
  NORMAL: "bg-signal-blue/10 text-signal-blue",
  HIGH: "bg-signal-orange/10 text-signal-orange",
  URGENT: "bg-destructive/10 text-destructive",
};

interface Ticket {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  lastReplyAt: string | null;
  updatedAt: string;
  actor: { id: string; title: string | null; actorName: string; apifyActorId: string } | null;
  _count: { messages: number };
}

type SearchParams = { page?: string; limit?: string };

export default async function SupportListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/support");

  const params = await searchParams;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = normalizePageSize(params.limit);
  let tickets: Ticket[] = [];
  let total = 0;
  let currentPage = page;
  let currentLimit = limit;
  let fetchError = false;
  try {
    const r = await authenticatedServerFetch(`/tickets?page=${page}&limit=${limit}`);
    if (r.ok) {
      const j = await r.json();
      tickets = j?.data?.items ?? [];
      total = j?.data?.total ?? 0;
      currentPage = j?.data?.page ?? page;
      currentLimit = j?.data?.limit ?? limit;
    } else {
      fetchError = true;
    }
  } catch {
    fetchError = true;
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Help / Workspace support"
        title="Support"
        description="Create and follow up on support requests."
        breadcrumbs={[{ label: "Help" }, { label: "Support" }]}
        primaryAction={
          <Button variant="signal" asChild className="w-full sm:w-auto">
            <Link href="/dashboard/support/new">
              <Plus className="mr-1 h-4 w-4" /> New ticket
            </Link>
          </Button>
        }
      />

      <Panel variant="default" radius="panel" noPadding>
        <div className="border-border/40 flex items-center gap-2 border-b px-5 py-4">
          <LifeBuoy className="text-signal-orange h-4 w-4" />
          <h3 className="text-base font-bold tracking-tight">Your tickets</h3>
        </div>

        {fetchError ? (
          <DashboardAsyncState
            status="error"
            title="Support tickets could not be loaded"
            description="The support API may be unavailable. Try refreshing the page before submitting a new request."
            className="m-4 sm:m-5"
          />
        ) : total === 0 ? (
          <EmptyState
            title="No tickets yet"
            description="Having an issue? Open a ticket and track replies here."
            action={{
              label: "Open your first ticket",
              href: "/dashboard/support/new",
              variant: "outline",
            }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead className="border-border/40 bg-muted/30 text-muted-foreground border-b text-left text-xs uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 font-medium sm:px-5 sm:py-3.5">#</th>
                    <th className="px-4 py-3 font-medium sm:px-5 sm:py-3.5">Subject</th>
                    <th className="px-4 py-3 font-medium sm:px-5 sm:py-3.5">Status</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell sm:px-5 sm:py-3.5">
                      Priority
                    </th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell sm:px-5 sm:py-3.5">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border/30 divide-y text-sm">
                  {tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                      <td className="text-muted-foreground px-4 py-3 font-mono sm:px-5 sm:py-3.5">
                        <Link href={`/dashboard/support/${t.id}`} className="hover:underline">
                          AL-{t.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 sm:px-5 sm:py-3.5">
                        <Link
                          href={`/dashboard/support/${t.id}`}
                          className="font-medium hover:underline"
                        >
                          {t.subject}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {t.category} · {t._count.messages} messages
                        </p>
                        {t.actor ? (
                          <p className="text-signal-blue mt-0.5 font-mono text-[11px]">
                            {t.actor.apifyActorId}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 sm:px-5 sm:py-3.5">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status] ?? ""}`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell sm:px-5 sm:py-3.5">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[t.priority] ?? ""}`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="text-muted-foreground hidden px-4 py-3 text-xs sm:table-cell sm:px-5 sm:py-3.5">
                        {new Date(t.updatedAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SupportPagination page={currentPage} limit={currentLimit} total={total} />
          </>
        )}
      </Panel>
    </div>
  );
}

function SupportPagination({ page, limit, total }: { page: number; limit: number; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <nav
      aria-label="Support ticket pagination"
      className="border-border/40 flex flex-col gap-3 border-t px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-muted-foreground">
        Showing {Math.min((page - 1) * limit + 1, total).toLocaleString("en-IN")}–
        {Math.min(page * limit, total).toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <ItemsPerPageSelect value={limit} />
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={supportHref(page - 1, limit)}>
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
          )}
          <span className="text-muted-foreground text-xs">
            Page {Math.min(page, totalPages)} of {totalPages}
          </span>
          {page < totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={supportHref(page + 1, limit)}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}

function supportHref(page: number, limit: number) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return `/dashboard/support?${params.toString()}`;
}
