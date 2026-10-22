import { PageHeader } from "@/components/admin/page-header";
import { AdminApiError } from "@/components/admin/admin-pagination";
import {
  WebsiteLogoCatalog,
  type WebsiteLogoCatalogData,
} from "@/components/admin/website-logo-catalog";
import { api } from "@/lib/admin/server-api";

export default async function AdminWebsiteLogosPage() {
  const response = await api<WebsiteLogoCatalogData>("/admin/website-logos?limit=200");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Website logos"
        description="Classify public Actors by website or service, review official assets, and recommend approved logo updates to workspace owners."
      />
      {response.ok ? (
        <WebsiteLogoCatalog initialData={response.data} />
      ) : (
        <AdminApiError message={response.error.message} />
      )}
    </div>
  );
}
