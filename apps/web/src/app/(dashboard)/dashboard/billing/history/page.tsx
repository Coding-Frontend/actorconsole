import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authenticatedServerFetch } from "@/lib/server-api";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { PaymentHistory, type BillingPayment } from "@/components/dashboard/payment-history";
import { normalizePageSize } from "@/lib/page-size";
import { redirect } from "next/navigation";

export default async function PaymentHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.page ?? 1);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000
      ? requestedPage
      : 1;
  const limit = normalizePageSize(params.limit);
  const response = await authenticatedServerFetch(
    `/account/billing-overview?page=${page}&limit=${limit}`,
  );
  if (!response.ok) throw new Error("Could not load payment history from the API");
  const body = await response.json();
  const data = body.data as {
    workspace: { name: string };
    payments: BillingPayment[];
    paymentsPagination: { total: number; page: number; limit: number };
  };
  const lastPage = Math.max(1, Math.ceil(data.paymentsPagination.total / limit));
  if (page > lastPage) redirect(`/dashboard/billing/history?page=${lastPage}&limit=${limit}`);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DashboardPageHeader
        context="Account / Workspace payments"
        title="Payment history"
        description={`Payments recorded for ${data.workspace.name}.`}
        breadcrumbs={[
          { label: "Account" },
          { label: "Billing", href: "/dashboard/billing" },
          { label: "Payment history" },
        ]}
        primaryAction={
          <Button asChild variant="outline">
            <Link href="/dashboard/billing">Back to billing</Link>
          </Button>
        }
        secondaryActions={[
          { label: "Ask billing support", href: "/dashboard/support/new?from=billing" },
        ]}
      />
      <PaymentHistory payments={data.payments} pagination={data.paymentsPagination} />
    </div>
  );
}
