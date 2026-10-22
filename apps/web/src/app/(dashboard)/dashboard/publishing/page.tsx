import { workspaceApifyRequiredPage } from "@/components/dashboard/workspace-apify-required-page";
import { BulkPublishingWorkspace } from "@/components/dashboard/bulk-publishing-workspace";

export default async function PublishingPage() {
  const setup = await workspaceApifyRequiredPage("Publishing");
  if (setup) return setup;
  return <BulkPublishingWorkspace />;
}
