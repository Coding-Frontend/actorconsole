import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { formatDate } from "@/lib/utils";
import { SubscriptionRowActions } from "@/components/admin/subscription-row-actions";
import { AdminApiError, AdminPagination } from "@/components/admin/admin-pagination";
import { Filter, Search } from "lucide-react";

interface SearchParams {
  q?: string;
  status?: string;
  provider?: string;
  sort?: string;
  order?: string;
  limit?: string;
  page?: string;
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100].includes(requestedLimit) ? requestedLimit : 50;
  const res = await api<any>("/admin/subscriptions", {
    params: {
      search: params.q || undefined,
      status: params.status || undefined,
      provider: params.provider || undefined,
      sort: params.sort || undefined,
      order: params.order || undefined,
      page,
      limit,
    },
  });
  if (!res.ok)
    return (
      <div className="space-y-6">
        <PageHeader title="Subscriptions" description="Subscription ledger" />
        <AdminApiError message={res.error.message} />
      </div>
    );
  const data = res.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" description={`${data.total} matching`} />

      <Card className="overflow-hidden">
        <form
          method="get"
          className="border-border grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_150px_150px_180px_110px_100px_auto_auto]"
        >
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Workspace, payer, or subscription ID"
              className="h-9 pl-9"
              aria-label="Search subscriptions"
            />
          </div>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          >
            <option value="">Every status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="cancellation_pending">Cancellation pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            name="provider"
            defaultValue={params.provider ?? ""}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          >
            <option value="">Every provider</option>
            <option value="manual">Manual</option>
            <option value="razorpay">Razorpay</option>
            <option value="stripe">Stripe</option>
          </select>
          <select
            name="sort"
            defaultValue={params.sort ?? "updatedAt"}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          >
            <option value="updatedAt">Recently updated</option>
            <option value="createdAt">Created</option>
            <option value="currentPeriodEnd">Renewal date</option>
            <option value="status">Status</option>
            <option value="provider">Provider</option>
          </select>
          <select
            name="order"
            defaultValue={params.order ?? "desc"}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <select
            name="limit"
            defaultValue={String(limit)}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            <Filter className="h-4 w-4" /> Apply
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/admin/subscriptions">Clear</Link>
          </Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Provider subscription</TableHead>
              <TableHead>Renews</TableHead>
              <TableHead>Cancelled?</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell>
                  <p className="font-medium">{s.businessProfile?.name ?? "Deleted workspace"}</p>
                  {s.businessProfile?.plan ? (
                    <Badge variant="outline" className="mt-1">
                      {s.businessProfile.plan}
                    </Badge>
                  ) : null}
                  {s.user?.email ? (
                    <p className="text-muted-foreground mt-1 text-xs">Payer: {s.user.email}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      s.status === "active"
                        ? "success"
                        : s.status === "cancelled"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {s.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <Badge variant="outline" className="mb-1 capitalize">
                    {s.provider}
                  </Badge>
                  <p>{s.providerSubscriptionId ?? s.razorpaySubscriptionId ?? "—"}</p>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : "—"}
                </TableCell>
                <TableCell>
                  {s.cancelAtPeriodEnd ? (
                    <Badge variant="warning">Yes</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">No</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <SubscriptionRowActions subscriptionId={s.id} status={s.status} />
                </TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-12 text-center text-sm">
                  No subscriptions.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <AdminPagination
        path="/admin/subscriptions"
        page={page}
        total={data.total}
        limit={limit}
        query={{
          q: params.q,
          status: params.status,
          provider: params.provider,
          sort: params.sort,
          order: params.order,
          limit: String(limit),
        }}
      />
    </div>
  );
}
