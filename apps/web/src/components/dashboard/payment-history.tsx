import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ItemsPerPageSelect } from "@/components/ui/items-per-page";
import Link from "next/link";

export type BillingPayment = {
  id: string;
  createdAt: string;
  description: string | null;
  amount: number | string;
  billingMode?: string | null;
  currency: string;
  status: string;
};

export function PaymentHistory({
  payments,
  pagination,
}: {
  payments: BillingPayment[];
  pagination: { total: number; page: number; limit: number };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Payment history
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {payments.length === 0 && pagination.total === 0 ? (
          <div className="text-muted-foreground p-8 text-center text-sm">No payments yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Recorded workspace payments</caption>
                <thead className="border-border/40 bg-muted/30 text-muted-foreground border-b text-left text-xs uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Description
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Amount
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border/40 divide-y text-sm">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="text-muted-foreground px-4 py-2 text-xs">
                        {p.createdAt ? formatDate(p.createdAt) : "—"}
                      </td>
                      <td className="px-4 py-2">{p.description ?? "Payment"}</td>
                      <td className="px-4 py-2 font-medium tabular-nums">
                        {formatCurrency(Number(p.amount), p.currency)}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            p.status === "captured"
                              ? "success"
                              : p.status === "refunded"
                                ? "warning"
                                : p.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                          }
                        >
                          {p.status}
                        </Badge>
                        {p.billingMode === "test" ? (
                          <Badge variant="warning" className="ml-2">
                            Test payment
                          </Badge>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <BillingPagination {...pagination} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BillingPagination({ page, limit, total }: { page: number; limit: number; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <nav
      aria-label="Payment history pagination"
      className="border-border/40 flex flex-col gap-3 border-t px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"
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
              <Link href={billingHref(page - 1, limit)}>
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
              <Link href={billingHref(page + 1, limit)}>
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

function billingHref(page: number, limit: number) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return `/dashboard/billing/history?${params.toString()}`;
}
