import { workspaceApifyRequiredPage } from "@/components/dashboard/workspace-apify-required-page";
import { BulkPublishingNewSchedule } from "@/components/dashboard/bulk-publishing-new-schedule";

export default async function NewPublishingSchedulePage() {
  const setup = await workspaceApifyRequiredPage("New publishing schedule");
  if (setup) return setup;
  return <BulkPublishingNewSchedule />;
}
