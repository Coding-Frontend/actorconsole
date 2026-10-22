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
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { relativeTime } from "@/lib/utils";
import { AdminApiError, AdminPagination } from "@/components/admin/admin-pagination";
import { AdminRegistryFilters } from "@/components/admin/admin-registry-filters";
import {
  EmailLogRowActions,
  type EmailLogRow,
} from "@/components/admin/email-log-row-actions";

export default async function EmailLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100, 200].includes(requestedLimit) ? requestedLimit : 50;
  const res = await api<any>("/admin/email-log", {
    params: {
      search: params.q || undefined,
      status: params.status || undefined,
      template: params.template || undefined,
      sort: params.sort || undefined,
      order: params.order || undefined,
      page,
      limit,
    },
  });
  if (!res.ok)
    return (
      <div className="space-y-6">
        <PageHeader title="Email log" description="Email delivery history" />
        <AdminApiError message={res.error.message} />
      </div>
    );
  const data = res.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Email log" description={`${data.total} emails sent`} />
      <Card className="overflow-hidden">
        <AdminRegistryFilters
          path="/admin/email-log"
          params={params}
          searchPlaceholder="Recipient, subject, or provider ID"
          filters={[
            {
              name: "status",
              label: "Statuses",
              options: ["sent", "failed", "bounced"].map((value) => ({ value, label: value })),
            },
          ]}
          sorts={[
            { value: "createdAt", label: "Newest" },
            { value: "to", label: "Recipient" },
            { value: "status", label: "Status" },
            { value: "template", label: "Template" },
          ]}
          defaultSort="createdAt"
          pageSizes={[25, 50, 100, 200]}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((e: EmailLogRow) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground text-xs">
                  {relativeTime(e.createdAt)}
                </TableCell>
                <TableCell className="text-sm">{e.to}</TableCell>
                <TableCell className="max-w-xs truncate">{e.subject}</TableCell>
                <TableCell className="text-xs">{e.template ?? "—"}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      e.status === "sent"
                        ? "success"
                        : e.status === "failed"
                          ? "destructive"
                          : "warning"
                    }
                  >
                    {e.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <EmailLogRowActions email={e} />
                </TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-12 text-center text-sm">
                  No emails logged yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      <AdminPagination
        path="/admin/email-log"
        page={page}
        total={data.total}
        limit={limit}
        query={{ ...params, page: undefined, limit: String(limit) }}
      />
    </div>
  );
}
