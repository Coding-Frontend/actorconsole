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

export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100, 200].includes(requestedLimit) ? requestedLimit : 50;
  const res = await api<any>("/admin/webhooks", {
    params: {
      search: params.q || undefined,
      source: params.source || undefined,
      status: params.status || undefined,
      sort: params.sort || undefined,
      order: params.order || undefined,
      page,
      limit,
    },
  });
  if (!res.ok)
    return (
      <div className="space-y-6">
        <PageHeader title="Webhook deliveries" description="Webhook event history" />
        <AdminApiError message={res.error.message} />
      </div>
    );
  const data = res.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Webhook deliveries" description={`${data.total} events logged`} />

      <Card className="overflow-hidden">
        <AdminRegistryFilters
          path="/admin/webhooks"
          params={params}
          searchPlaceholder="Event type, external ID, or error"
          filters={[
            {
              name: "source",
              label: "Sources",
              options: ["stripe", "razorpay", "dodo", "apify"].map((value) => ({
                value,
                label: value,
              })),
            },
            {
              name: "status",
              label: "Statuses",
              options: ["received", "processed", "failed"].map((value) => ({
                value,
                label: value,
              })),
            },
          ]}
          sorts={[
            { value: "createdAt", label: "Newest" },
            { value: "source", label: "Source" },
            { value: "eventType", label: "Event type" },
            { value: "status", label: "Status" },
            { value: "responseMs", label: "Response time" },
          ]}
          defaultSort="createdAt"
          pageSizes={[25, 50, 100, 200]}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((w: any) => (
              <TableRow key={w.id}>
                <TableCell className="text-muted-foreground text-xs">
                  <Link href={`/admin/webhooks/${w.id}`} className="hover:text-signal-orange">
                    {formatDate(w.createdAt, { withTime: true })}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{w.source}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{w.eventType ?? "—"}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      w.status === "processed"
                        ? "success"
                        : w.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {w.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {w.responseMs != null ? `${w.responseMs}ms` : "—"}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/webhooks/${w.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-12 text-center text-sm">
                  No webhook events yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <AdminPagination
        path="/admin/webhooks"
        page={page}
        total={data.total}
        limit={limit}
        query={{ ...params, page: undefined, limit: String(limit) }}
      />
    </div>
  );
}
