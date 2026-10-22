import Link from "next/link";
import { ArrowUpRight, KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { INTEGRATION_CATALOG } from "@actorconsole/shared";
import {
  IntegrationsCollection,
  type IntegrationItem,
} from "@/components/admin/integrations-collection";
import { AdminApiError } from "@/components/admin/admin-pagination";

export default async function AdminIntegrationsPage() {
  const res = await api<IntegrationItem[]>("/admin/integrations");
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Integrations" description="Manage encrypted platform credentials." />
        <AdminApiError message={res.error.message ?? "Failed to load integrations"} />
      </div>
    );
  }
  const integrations: IntegrationItem[] = res.data.filter((item) => item.category !== "payment");

  const byCategory: Record<string, IntegrationItem[]> = {};
  const catalogCategories = [
    ...new Set(INTEGRATION_CATALOG.filter((d) => d.category !== "payment").map((d) => d.category)),
  ];
  for (const cat of catalogCategories) {
    byCategory[cat] = integrations.filter((i) => i.category === cat);
  }

  const configuredCount = integrations.filter((i) => i.isConfigured).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description={`${configuredCount}/${integrations.length} credentials configured`}
      />

      <p className="text-muted-foreground text-sm">
        Payment credentials, products, and test/live modes are managed in{" "}
        <Link href="/admin/payment-gateways" className="text-signal-orange hover:underline">
          Payment gateways
        </Link>
        .
      </p>

      <Card className="border-signal-blue/25 bg-signal-blue/[0.045]">
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <KeyRound className="text-signal-blue mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1 text-sm leading-relaxed">
            <p className="font-medium">Apify credential contract</p>
            <p className="text-muted-foreground">
              The API key is required for Actor discovery, builds, runs, metadata writes, schedules,
              and publication. Configure Platform Apify Cookies for Console metadata, category
              feedback, pictures, and reads. ActorConsole automatically obtains the UI token from
              the backend ApifyRT cookie; no manual UI key is needed. A healthy manual UI key can
              serve as a fallback if cookies expire.
            </p>
            <Link
              href="https://console.apify.com/settings/integrations"
              target="_blank"
              rel="noreferrer"
              className="text-signal-blue inline-flex items-center gap-1 text-xs font-medium hover:underline"
            >
              Open Apify Settings → API &amp; Integrations <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      {integrations.length === 0 ? (
        <Card>
          <div className="text-muted-foreground p-8 text-center text-sm">
            No integration definitions found.
          </div>
        </Card>
      ) : (
        <IntegrationsCollection byCategory={byCategory} />
      )}
    </div>
  );
}
