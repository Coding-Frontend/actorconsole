import type { ProBillingOption, PaymentMode } from "@actorconsole/shared/payment-gateways";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authenticatedServerFetch } from "@/lib/server-api";
import { BillingCard } from "@/components/dashboard/billing-card";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";

export default async function BillingPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const billingDestination =
    query?.interval === "year" ? "/dashboard/billing?interval=year" : "/dashboard/billing";
  const [response, gatewayResponse] = await Promise.all([
    authenticatedServerFetch("/account/billing-overview?limit=1"),
    authenticatedServerFetch("/payment-gateways"),
  ]);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    if (response.status === 409 && error?.error?.code === "workspace_required") {
      redirect(`/dashboard/onboarding?callbackUrl=${encodeURIComponent(billingDestination)}`);
    }
    throw new Error("Could not load billing data from the API");
  }
  const body = await response.json();
  const user = body.data as {
    workspace: { id: string; name: string };
    plan: "FREE" | "PRO";
    subscriptions: Array<{
      id: string;
      status: string;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      provider: string;
      billingMode?: string | null;
      providerSubscriptionId: string | null;
      providerProductId: string | null;
      razorpaySubscriptionId: string | null;
    }>;
    billingAddresses: {
      company?: string | null;
      gstin?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      country?: string | null;
    } | null;
  };
  const gatewayBody = gatewayResponse.ok ? await gatewayResponse.json() : { data: [] };
  const gateways = (gatewayBody.data ?? []) as Array<{
    key: "stripe" | "razorpay" | "dodo";
    name: string;
    billingOptions: ProBillingOption[];
    mode?: PaymentMode;
  }>;

  const activeSub = user.subscriptions.find(
    (subscription) =>
      ["active", "cancellation_pending"].includes(subscription.status) ||
      (subscription.cancelAtPeriodEnd &&
        subscription.currentPeriodEnd !== null &&
        new Date(subscription.currentPeriodEnd) > new Date()),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DashboardPageHeader
        context="Account / Workspace plan"
        title="Billing & subscription"
        description={`Manage the subscription for ${user.workspace.name}.`}
        breadcrumbs={[{ label: "Account" }, { label: "Billing" }]}
        primaryAction={
          <Button asChild variant="outline">
            <Link href="/dashboard/billing/history">Payment history</Link>
          </Button>
        }
        secondaryActions={[
          { label: "Ask billing support", href: "/dashboard/support/new?from=billing" },
        ]}
      />

      <BillingCard
        plan={user.plan}
        initialInterval={query?.interval === "year" ? "year" : "month"}
        canCancelSubscription={Boolean(
          (activeSub?.providerSubscriptionId ?? activeSub?.razorpaySubscriptionId) &&
          !activeSub?.cancelAtPeriodEnd &&
          activeSub?.status !== "cancellation_pending",
        )}
        gateways={gateways}
        billingAddress={user.billingAddresses}
        subscription={
          activeSub
            ? {
                status: activeSub.status,
                billingMode: activeSub.billingMode,
                currentPeriodEnd: activeSub.currentPeriodEnd,
                cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd,
              }
            : null
        }
      />
    </div>
  );
}
