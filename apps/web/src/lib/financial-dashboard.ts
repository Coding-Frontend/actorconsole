import type { UsageCostsPayload } from "@/components/dashboard/usage-costs-analytics";
import { authenticatedServerFetch } from "@/lib/server-api";

export type FinancialDashboardKind = "usage" | "costs" | "revenue";

export async function loadFinancialDashboard(
  kind: FinancialDashboardKind,
  params: Record<string, string | string[] | undefined>,
): Promise<UsageCostsPayload> {
  const apiParams = new URLSearchParams();
  const copyParam = (source: string, target = source) => {
    const value = params[source];
    if (typeof value === "string" && value.trim()) apiParams.set(target, value);
  };

  copyParam("from");
  copyParam("to");
  copyParam("actors", "actorIds");
  copyParam("granularity");
  copyParam("mode");
  copyParam("compare");
  copyParam("day");
  copyParam("table");

  const response = await authenticatedServerFetch(
    `/actors/${kind}${apiParams.size ? `?${apiParams.toString()}` : ""}`,
  );
  if (!response.ok) throw new Error(`Could not load ${kind} analytics from the API`);
  const body = await response.json();
  const data = body.data as UsageCostsPayload | undefined;
  if (!data) throw new Error(`Could not load ${kind} analytics from the API`);

  // Focused financial endpoints expose metadata both at the envelope and data
  // level for backwards compatibility. Keep the client payload stable when a
  // legacy server only sends the top-level metadata.
  return data.meta ? data : { ...data, meta: body.meta };
}

export function financialLastSynchronizedAt(
  payload: UsageCostsPayload,
  kind: FinancialDashboardKind,
) {
  if (kind === "usage") return payload.latestSyncAt ?? null;
  if (kind === "revenue") {
    return payload.revenue?.syncedAt ?? payload.accountUsage?.syncedAt ?? null;
  }
  return payload.accountUsage?.syncedAt ?? payload.latestSyncAt ?? null;
}
