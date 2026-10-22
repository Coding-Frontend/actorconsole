import { loadWorkspaceApifyConnection } from "@/lib/server-apify-connection";
import { workspaceApifySetupReason } from "@/lib/workspace-apify-connection";
import { WorkspaceApifySetup } from "@/components/dashboard/workspace-apify-setup";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";

/** Call before loading an Apify-dependent page so setup never appears as an empty chart/error. */
export async function workspaceApifyRequiredPage(title: string) {
  const status = await loadWorkspaceApifyConnection();
  const reason = workspaceApifySetupReason(status);
  if (!reason) return null;
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Workspace setup"
        title={title}
        description={`Connect Apify to use ${title.toLowerCase()} in this workspace.`}
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: title }]}
      />
      <WorkspaceApifySetup reason={reason} />
    </div>
  );
}
