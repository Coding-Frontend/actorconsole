import { PageHeader } from "@/components/admin/page-header";
import {
  AiProvidersManager,
  type AiProviderView,
  type AiProxyView,
} from "@/components/admin/ai-providers-manager";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/admin/server-api";
import { AdminApiError } from "@/components/admin/admin-pagination";

interface AiProvidersResponse {
  providers: AiProviderView[];
  proxy: AiProxyView;
}

export default async function AdminAiProvidersPage() {
  const response = await api<AiProvidersResponse>("/admin/ai-providers");
  const data = response.ok ? response.data : null;
  const enabled = data?.providers.filter((provider) => provider.enabled).length ?? 0;
  const ready = data?.providers.filter((provider) => provider.readiness.ready).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI providers"
        description="Prioritized text-generation routing with account rotation and Apify proxy support"
      />
      {!response.ok ? (
        <AdminApiError message={response.error.message ?? "Failed to load AI providers"} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Providers</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{data?.providers.length ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Enabled</p>
          <p className="text-signal-green mt-1 text-2xl font-bold tabular-nums">{enabled}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Ready</p>
          <p className="text-signal-blue mt-1 text-2xl font-bold tabular-nums">{ready}</p>
        </Card>
      </div>
      {data ? (
        <AiProvidersManager providers={data.providers} proxy={data.proxy} />
      ) : null}
    </div>
  );
}
