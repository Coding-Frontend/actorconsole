import { workspaceApifyRequiredPage } from "@/components/dashboard/workspace-apify-required-page";
import { BulkPublishingSchedules } from "@/components/dashboard/bulk-publishing-schedules";

export default async function PublishingSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; operation?: string }>;
}) {
  const setup = await workspaceApifyRequiredPage("Publishing schedules");
  if (setup) return setup;
  const params = await searchParams;
  return (
    <BulkPublishingSchedules
      initialView={params.view === "status-changes" ? "status-changes" : "schedules"}
      initialOperationId={params.operation}
    />
  );
}
