import type { PublishingOverviewPayload } from "@actorconsole/shared/default-dashboard";
import { authenticatedServerFetch } from "@/lib/server-api";
import { PublishingOverview } from "@/components/dashboard/publishing-overview";

export default async function PublishingOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (typeof params.page === "string") query.set("page", params.page);
  const response = await authenticatedServerFetch(
    `/account/publishing-overview${query.size ? `?${query}` : ""}`,
  );
  const body = await response.json();
  if (!response.ok || !body.data)
    throw new Error(body.error?.message ?? "Could not load publishing overview");
  return <PublishingOverview payload={body.data as PublishingOverviewPayload} />;
}
