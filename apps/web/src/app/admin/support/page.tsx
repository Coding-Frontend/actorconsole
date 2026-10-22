import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { AdminApiError, AdminPagination } from "@/components/admin/admin-pagination";
import { AdminRegistryFilters } from "@/components/admin/admin-registry-filters";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-signal-blue/10 text-signal-blue",
  PENDING: "bg-signal-orange/10 text-signal-orange",
  RESPONDED: "bg-signal-blue/10 text-signal-blue",
  RESOLVED: "bg-signal-green/10 text-signal-green",
  CLOSED: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
};

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100].includes(requestedLimit) ? requestedLimit : 50;
  const res = await api<any>("/admin/support", {
    params: {
      q: params.q || undefined,
      status: params.status || undefined,
      priority: params.priority || undefined,
      sort: params.sort || undefined,
      order: params.order || undefined,
      page,
      limit,
    },
  });
  if (!res.ok)
    return (
      <div className="space-y-6">
        <PageHeader title="Support tickets" description="Customer support queue" />
        <AdminApiError message={res.error.message} />
      </div>
    );
  const data = res.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Support tickets" description={`${data.total} total`} />

      <Card className="overflow-hidden">
        <AdminRegistryFilters
          path="/admin/support"
          params={params}
          searchPlaceholder="Ticket subject or requester email"
          filters={[
            {
              name: "status",
              label: "Statuses",
              options: ["OPEN", "PENDING", "RESPONDED", "RESOLVED", "CLOSED"].map((value) => ({
                value,
                label: value,
              })),
            },
            {
              name: "priority",
              label: "Priorities",
              options: ["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => ({
                value,
                label: value,
              })),
            },
          ]}
          sorts={[
            { value: "updatedAt", label: "Recently updated" },
            { value: "createdAt", label: "Created" },
            { value: "status", label: "Status" },
            { value: "priority", label: "Priority" },
          ]}
          defaultSort="updatedAt"
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link
                    href={`/admin/support/${t.id}`}
                    className="hover:text-signal-orange font-medium"
                  >
                    AL-{t.number}
                  </Link>
                  <p className="text-muted-foreground max-w-xs truncate text-xs">{t.subject}</p>
                  {t.actor ? (
                    <p className="text-signal-blue mt-0.5 max-w-xs truncate text-[10px]">
                      {t.actor.title ?? t.actor.actorName}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">{t.user.name ?? t.user.email}</TableCell>
                <TableCell>
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status] ?? ""}`}
                  >
                    {t.status}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      t.priority === "URGENT"
                        ? "destructive"
                        : t.priority === "HIGH"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {t.priority}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {t.assignedTo?.name ?? t.assignedTo?.email ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {t.updatedAt ? formatDate(t.updatedAt) : "—"}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/support/${t.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-12 text-center text-sm">
                  No tickets.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <AdminPagination
        path="/admin/support"
        page={page}
        total={data.total}
        limit={limit}
        query={{ ...params, page: undefined, limit: String(limit) }}
      />
    </div>
  );
}
