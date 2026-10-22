import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { AdminDetailError } from "@/components/admin/admin-pagination";
import { api } from "@/lib/admin/server-api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

interface SubscriptionDetail {
  id: string;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerProductId: string | null;
  providerCheckoutId: string | null;
  razorpayCustomerId: string | null;
  razorpaySubscriptionId: string | null;
  razorpayPlanId: string | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  shortUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; name: string | null } | null;
  businessProfile: { id: string; name: string; plan: string } | null;
  payments: Array<{
    id: string;
    amount: string;
    currency: string;
    status: string;
    method: string | null;
    provider: string;
    providerPaymentId: string | null;
    providerInvoiceId: string | null;
    razorpayPaymentId: string | null;
    razorpayInvoiceId: string | null;
    refundedAmount: string | null;
    createdAt: string;
  }>;
}

export default async function AdminSubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await api<SubscriptionDetail>(`/admin/subscriptions/${id}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <AdminDetailError
        title="Subscription unavailable"
        message={res.error.message}
        backHref="/admin/subscriptions"
        backLabel="Back to subscriptions"
      />
    );
  }
  const s = res.data;

  const totalCaptured = s.payments
    .filter((p) => p.status === "captured")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const totalRefunded = s.payments
    .filter((p) => p.status === "refunded")
    .reduce((sum, p) => sum + Number(p.refundedAmount ?? p.amount), 0);
  const summaryCurrency = s.payments[0]?.currency ?? "INR";

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/subscriptions">
          <ArrowLeft className="h-4 w-4" /> Back to subscriptions
        </Link>
      </Button>

      <PageHeader
        title={`Subscription — ${s.businessProfile?.name ?? "Deleted workspace"}`}
        description={`${s.status} · ${s.cancelAtPeriodEnd ? "Cancels at period end" : "Active"}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="User"
              value={
                s.user ? (
                  <Link
                    href={`/admin/users/${s.user.id}`}
                    className="text-signal-orange font-medium hover:underline"
                  >
                    {s.user.name ?? s.user.email}
                  </Link>
                ) : (
                  "Deleted user"
                )
              }
            />
            <Row label="Workspace" value={s.businessProfile?.name ?? "Deleted workspace"} />
            <Row
              label="Workspace plan"
              value={s.businessProfile ? <Badge>{s.businessProfile.plan}</Badge> : "—"}
            />
            <Row
              label="Status"
              value={
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
              }
            />
            <Row label="Cancel at end" value={s.cancelAtPeriodEnd ? "Yes" : "No"} />
            <Row
              label="Period end"
              value={s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : "—"}
            />
            <Row label="Created" value={formatDate(s.createdAt)} />
          </CardContent>
        </Card>

        {/* Payment summary */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="bg-signal-green/10 rounded-lg p-3 text-center">
              <p className="text-signal-green text-xs font-medium">Captured</p>
              <p className="text-signal-green text-2xl font-bold">
                {formatCurrency(totalCaptured, summaryCurrency)}
              </p>
            </div>
            <div className="bg-signal-orange/10 rounded-lg p-3 text-center">
              <p className="text-signal-orange text-xs font-medium">Refunded</p>
              <p className="text-signal-orange text-2xl font-bold">
                {formatCurrency(totalRefunded, summaryCurrency)}
              </p>
            </div>
            <div className="bg-signal-blue/10 rounded-lg p-3 text-center">
              <p className="text-signal-blue text-xs font-medium">Net</p>
              <p className="text-signal-blue text-2xl font-bold">
                {formatCurrency(totalCaptured - totalRefunded, summaryCurrency)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Provider info */}
        <Card>
          <CardHeader>
            <CardTitle className="capitalize">{s.provider}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Customer ID"
              value={
                <code className="text-xs">
                  {s.providerCustomerId ?? s.razorpayCustomerId ?? "—"}
                </code>
              }
            />
            <Row
              label="Subscription ID"
              value={
                <code className="text-xs">
                  {s.providerSubscriptionId ?? s.razorpaySubscriptionId ?? "—"}
                </code>
              }
            />
            <Row
              label="Plan ID"
              value={
                <code className="text-xs">{s.providerProductId ?? s.razorpayPlanId ?? "—"}</code>
              }
            />
            {s.shortUrl && (
              <Row
                label="Short URL"
                value={
                  <a
                    href={s.shortUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-signal-orange text-xs hover:underline"
                  >
                    Open ↗
                  </a>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Payments ({s.payments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Method</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Payment ID</th>
                  <th className="pb-2 font-medium">Refunded</th>
                </tr>
              </thead>
              <tbody>
                {s.payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 text-xs">{formatDate(p.createdAt)}</td>
                    <td className="py-2 font-medium">
                      {formatCurrency(Number(p.amount), p.currency)}
                    </td>
                    <td className="py-2 text-xs">{p.method ?? "—"}</td>
                    <td className="py-2">
                      <Badge
                        variant={
                          p.status === "captured"
                            ? "success"
                            : p.status === "refunded"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {(p.providerPaymentId ?? p.razorpayPaymentId)?.slice(-12) ?? "—"}
                    </td>
                    <td className="py-2 text-xs">
                      {p.refundedAmount
                        ? formatCurrency(Number(p.refundedAmount), p.currency)
                        : "—"}
                    </td>
                  </tr>
                ))}
                {s.payments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                      No payments recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-border/40 flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
