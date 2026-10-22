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
import { AdminApiError, AdminPagination } from "@/components/admin/admin-pagination";
import { AdminRegistryFilters } from "@/components/admin/admin-registry-filters";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const now = new Date();
  const page = Math.max(1, Number(params.page) || 1);
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100, 200].includes(requestedLimit) ? requestedLimit : 50;
  const res = await api<any>("/admin/usage", {
    params: {
      search: params.q || undefined,
      metric: params.metric || undefined,
      month: params.month ?? String(now.getMonth() + 1),
      year: params.year ?? String(now.getFullYear()),
      sort: params.sort || undefined,
      order: params.order || undefined,
      page,
      limit,
    },
  });
  if (!res.ok)
    return (
      <div className="space-y-6">
        <PageHeader title="Usage" description="Per-metric usage records" />
        <AdminApiError message={res.error.message} />
      </div>
    );
  const data = res.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Usage" description="Per-metric usage records across all users." />
      <Card className="overflow-hidden">
        <AdminRegistryFilters
          path="/admin/usage"
          params={{
            ...params,
            month: params.month ?? String(now.getMonth() + 1),
            year: params.year ?? String(now.getFullYear()),
          }}
          searchPlaceholder="Metric, user, email, or account ID"
          filters={[
            {
              name: "metric",
              label: "Metrics",
              options: [
                { value: "mcp_calls", label: "MCP calls" },
                { value: "api_requests", label: "API requests" },
              ],
            },
            {
              name: "month",
              label: "Months",
              options: Array.from({ length: 12 }, (_, index) => ({
                value: String(index + 1),
                label: new Date(2000, index, 1).toLocaleString("en-IN", { month: "long" }),
              })),
            },
            {
              name: "year",
              label: "Years",
              options: Array.from({ length: 5 }, (_, index) => {
                const value = String(now.getFullYear() - index);
                return { value, label: value };
              }),
            },
          ]}
          sorts={[
            { value: "quantity", label: "Quantity" },
            { value: "metric", label: "Metric" },
            { value: "userId", label: "User" },
            { value: "month", label: "Month" },
            { value: "year", label: "Year" },
          ]}
          defaultSort="quantity"
          pageSizes={[25, 50, 100, 200]}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="text-sm font-medium">{u.user?.name ?? u.user?.email ?? u.userId}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {u.user?.email ?? u.userId}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{u.metric}</Badge>
                </TableCell>
                <TableCell className="font-medium">{u.quantity.toLocaleString()}</TableCell>
                <TableCell className="text-xs">
                  {u.month}/{u.year}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/users/${u.userId}`}>Open user</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-12 text-center text-sm">
                  No usage records yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      <AdminPagination
        path="/admin/usage"
        page={page}
        total={data.total}
        limit={limit}
        query={{
          ...params,
          page: undefined,
          month: params.month ?? String(now.getMonth() + 1),
          year: params.year ?? String(now.getFullYear()),
          limit: String(limit),
        }}
      />
    </div>
  );
}
