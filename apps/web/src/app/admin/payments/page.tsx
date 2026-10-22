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
import { formatCurrency, formatDate } from "@/lib/utils";
import { PaymentRowActions } from "@/components/admin/payment-row-actions";
import { AdminApiError, AdminPagination } from "@/components/admin/admin-pagination";
import { Filter, Search } from "lucide-react";

interface SearchParams {
  q?: string;
  status?: string;
  provider?: string;
  currency?: string;
  sort?: string;
  order?: string;
  limit?: string;
  page?: string;
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100, 200].includes(requestedLimit) ? requestedLimit : 50;
  const res = await api<any>("/admin/payments", {
    params: {
      search: params.q || undefined,
      status: params.status || undefined,
      provider: params.provider || undefined,
      currency: params.currency || undefined,
      sort: params.sort || undefined,
      order: params.order || undefined,
      page,
      limit,
    },
  });
  if (!res.ok)
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description="Payment ledger" />
        <AdminApiError message={res.error.message} />
      </div>
    );
  const data = res.data;

  const currencySummaries = (data.summary?.byCurrency ?? []) as Array<{
    currency: string;
    captured: number;
    refunded: number;
    net: number;
  }>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={`${data.total} payments across ${currencySummaries.length || 0} currencies`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {currencySummaries.map((summary) => (
          <Card key={summary.currency} className="p-4">
            <p className="text-muted-foreground text-xs">{summary.currency} live net revenue</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatCurrency(summary.net, summary.currency)}
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              {formatCurrency(summary.captured, summary.currency)} captured ·{" "}
              {formatCurrency(summary.refunded, summary.currency)} refunded
            </p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <form
          method="get"
          className="border-border grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-[minmax(250px,1fr)_150px_140px_110px_160px_110px_100px_auto_auto]"
        >
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="User, workspace, order, or payment ID"
              className="h-9 pl-9"
              aria-label="Search payments"
            />
          </div>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          >
            <option value="">Every status</option>
            <option value="captured">Captured</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="partially_refunded">Partially refunded</option>
            <option value="created">Created</option>
          </select>
          <select
            name="provider"
            defaultValue={params.provider ?? ""}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          >
            <option value="">Every provider</option>
            <option value="razorpay">Razorpay</option>
            <option value="stripe">Stripe</option>
            <option value="dodo">Dodo Payments</option>
            <option value="manual">Manual</option>
          </select>
          <Input
            name="currency"
            defaultValue={params.currency ?? ""}
            placeholder="Currency"
            className="h-9 uppercase"
            aria-label="Filter by currency"
          />
          <select
            name="sort"
            defaultValue={params.sort ?? "createdAt"}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          >
            <option value="createdAt">Created</option>
            <option value="capturedAt">Captured</option>
            <option value="amount">Amount</option>
            <option value="status">Status</option>
            <option value="provider">Provider</option>
            <option value="currency">Currency</option>
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
            <option value="200">200 rows</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            <Filter className="h-4 w-4" /> Apply
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/admin/payments">Clear</Link>
          </Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order / Payment ID</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground text-xs">
                  {formatDate(p.createdAt, { withTime: true })}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{p.user?.name ?? p.user?.email ?? "Deleted user"}</p>
                  {p.user?.email ? (
                    <p className="text-muted-foreground text-xs">{p.user.email}</p>
                  ) : null}
                  {p.businessProfile?.name ? (
                    <p className="text-muted-foreground text-xs">{p.businessProfile.name}</p>
                  ) : null}
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  {formatCurrency(Number(p.amount), p.currency)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{p.method ?? "—"}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      p.status === "captured"
                        ? "success"
                        : p.status === "refunded" || p.status === "partially_refunded"
                          ? "warning"
                          : p.status === "failed"
                            ? "destructive"
                            : "secondary"
                    }
                  >
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <Badge variant="outline" className="mb-1 capitalize">
                    {p.provider}
                  </Badge>
                  {p.billingMode === "test" ? (
                    <Badge variant="warning" className="ml-2">
                      Test
                    </Badge>
                  ) : null}
                  <p>{p.providerOrderId ?? p.razorpayOrderId ?? "—"}</p>
                  <p className="text-muted-foreground">
                    {p.providerPaymentId ?? p.razorpayPaymentId ?? "—"}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <PaymentRowActions payment={p} />
                </TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-12 text-center text-sm">
                  No payments yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <AdminPagination
        path="/admin/payments"
        page={page}
        total={data.total}
        limit={limit}
        query={{
          q: params.q,
          status: params.status,
          provider: params.provider,
          currency: params.currency,
          sort: params.sort,
          order: params.order,
          limit: String(limit),
        }}
      />
    </div>
  );
}
