import { PageHeader } from "@/components/admin/page-header";
import { PaymentGatewaysManager } from "@/components/admin/payment-gateways-manager";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/admin/server-api";
import { AdminApiError } from "@/components/admin/admin-pagination";
import type {
  ProBillingOption,
  PaymentMode,
  PaymentModeProfile,
} from "@actorconsole/shared/payment-gateways";

interface PaymentGateway {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  updatedAt: string | null;
  callbackUrl: string | null;
  mode?: PaymentMode;
  profiles?: PaymentModeProfile[];
  billingOptions?: ProBillingOption[];
  readiness: {
    ready: boolean;
    configuredKeys: string[];
    missingCredentials: string[];
    missingProducts: string[];
  };
}

export default async function AdminPaymentGatewaysPage() {
  const res = await api<PaymentGateway[]>("/admin/payment-gateways");
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payment gateways" description="Configure subscription providers." />
        <AdminApiError message={res.error.message ?? "Failed to load payment gateways"} />
      </div>
    );
  }
  const gateways = res.data;
  const enabledCount = gateways.filter((gateway) => gateway.enabled).length;
  const readyCount = gateways.filter((gateway) => gateway.readiness.ready).length;
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:8080"
  ).replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment gateways"
        description="Manage checkout providers, environment credentials, and Pro subscription plans."
      />

      <dl className="border-border flex flex-wrap gap-x-8 gap-y-3 border-b pb-5 text-sm">
        <div className="flex items-center gap-2">
          <dt className="text-muted-foreground">Providers</dt>
          <dd className="font-semibold tabular-nums">{gateways.length}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-muted-foreground">Enabled for checkout</dt>
          <dd className="font-semibold tabular-nums">{enabledCount}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-muted-foreground">Setup needed</dt>
          <dd className="font-semibold tabular-nums">{gateways.length - readyCount}</dd>
        </div>
      </dl>

      {gateways.length === 0 ? (
        <Card className="p-8 text-center">
          <h2 className="font-semibold">No payment providers available</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Payment gateways have not been initialized in the database. Initialize the providers,
            then return here to configure checkout.
          </p>
        </Card>
      ) : (
        <PaymentGatewaysManager gateways={gateways} siteUrl={siteUrl} />
      )}

      <div className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
        <h3 className="text-sm font-medium">Subscription setup</h3>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Credentials are encrypted and secret values remain write-only.</li>
          <li>Copy each webhook URL into the matching provider dashboard.</li>
          <li>
            Save separate test and live profiles here, then select the mode used for new checkouts.
          </li>
          <li>
            Connect an existing monthly and yearly Pro plan to offer both billing choices. A gateway
            needs credentials and at least one Pro option before it can be enabled.
          </li>
        </ul>
      </div>
    </div>
  );
}
