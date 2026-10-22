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
import { formatDate, relativeTime } from "@/lib/utils";
import Link from "next/link";
import { AdminApiError, AdminPagination } from "@/components/admin/admin-pagination";
import { AdminRegistryFilters } from "@/components/admin/admin-registry-filters";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100, 200].includes(requestedLimit) ? requestedLimit : 50;
  const res = await api<any>("/admin/audit-log", {
    params: {
      search: params.q || undefined,
      source: params.source || undefined,
      sort: params.sort || undefined,
      order: params.order || undefined,
      page,
      limit,
    },
  });
  if (!res.ok)
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" description="Admin actions" />
        <AdminApiError message={res.error.message} />
      </div>
    );
  const data = res.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description={`${data.total} admin actions recorded`} />

      <Card className="overflow-hidden">
        <AdminRegistryFilters
          path="/admin/audit-log"
          params={params}
          searchPlaceholder="Action, resource, admin, or affected user"
          filters={[
            {
              name: "source",
              label: "Sources",
              options: [
                { value: "ui", label: "Admin UI" },
                { value: "api-key", label: "API key" },
              ],
            },
          ]}
          sorts={[
            { value: "createdAt", label: "Newest" },
            { value: "action", label: "Action" },
            { value: "source", label: "Source" },
          ]}
          defaultSort="createdAt"
          pageSizes={[25, 50, 100, 200]}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((l: any) => (
              <TableRow key={l.id}>
                <TableCell
                  className="text-muted-foreground text-xs"
                  title={formatDate(l.createdAt, { withTime: true })}
                >
                  <Link href={`/admin/audit-log/${l.id}`} className="hover:text-signal-orange">
                    {relativeTime(l.createdAt)}
                  </Link>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{l.admin?.name ?? l.admin?.email ?? "—"}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{l.action}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{l.resource ?? "—"}</TableCell>
                <TableCell className="text-xs">{l.actor?.email ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{l.ip ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/audit-log/${l.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-12 text-center text-sm">
                  No audit entries.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <AdminPagination
        path="/admin/audit-log"
        page={page}
        total={data.total}
        limit={limit}
        query={{ ...params, page: undefined, limit: String(limit) }}
      />
    </div>
  );
}
