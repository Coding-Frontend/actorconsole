"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-base";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";
import { useWorkspaceAccess } from "./workspace-access-context";

export type ApifyOperationsSummary = {
  connected: boolean;
  api: {
    configured: boolean;
    available: boolean;
    inventory?: {
      actors?: number | null;
      runs?: number | null;
      datasets?: number | null;
      keyValueStores?: number | null;
      requestQueues?: number | null;
    } | null;
  } | null;
  console: {
    configured: boolean;
    available: boolean;
    sections?: {
      organizations?: { available: boolean; count: number | null };
      proxy?: { available: boolean; billingCycles: number | null };
      billing?: { available: boolean; serviceGroups: number | null };
      notifications?: { available: boolean; total: number | null; unread: number | null };
    };
  } | null;
};

const apiMetrics = [
  { key: "actors", label: "Actors" },
  { key: "runs", label: "Runs" },
  { key: "datasets", label: "Datasets" },
  { key: "keyValueStores", label: "Key-value stores" },
  { key: "requestQueues", label: "Request queues" },
] as const;

export function ApifyOperationsSummaryLoader() {
  const { access, error: accessError } = useWorkspaceAccess();
  const restricted = Boolean(access?.restricted || accessError);
  const [data, setData] = useState<ApifyOperationsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/apify/operations`, {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json()) as {
        data?: ApifyOperationsSummary;
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Could not load connected Apify surfaces");
      }
      setData(body.data);
      setLastRefreshedAt(new Date());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load connected Apify surfaces",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (restricted) return;
    void load();
    const refresh = () => void load();
    window.addEventListener(DASHBOARD_STATUS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DASHBOARD_STATUS_CHANGED_EVENT, refresh);
  }, [load, restricted]);

  if (restricted) return null;
  if (loading && !data) return <ApifyOperationsSummarySkeleton />;
  if (!data && error) {
    return (
      <Panel
        variant="default"
        radius="panel"
        className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div>
          <p className="font-medium">Connected Apify surfaces are temporarily unavailable</p>
          <p className="text-muted-foreground mt-1 text-sm">{error}</p>
        </div>
        <Button variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void load()}>
          Retry live check
        </Button>
      </Panel>
    );
  }
  return (
    <ApifyOperationsSummaryPanel
      data={data}
      lastRefreshedAt={lastRefreshedAt}
      refreshing={loading}
      refreshError={error}
      onRefresh={() => void load()}
    />
  );
}

function ApifyOperationsSummarySkeleton() {
  return (
    <Panel
      variant="default"
      radius="panel"
      className="p-5 sm:p-6"
      aria-label="Loading Apify surfaces"
    >
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="mt-5 h-14 w-full" />
      <Skeleton className="mt-3 h-14 w-full" />
    </Panel>
  );
}

export function ApifyOperationsSummaryPanel({
  data,
  lastRefreshedAt = null,
  refreshing = false,
  refreshError = null,
  onRefresh,
}: {
  data: ApifyOperationsSummary | null;
  lastRefreshedAt?: Date | null;
  refreshing?: boolean;
  refreshError?: string | null;
  onRefresh?: () => void;
}) {
  const apiAvailable = Boolean(data?.api?.available);
  const consoleAvailable = Boolean(data?.console?.available);
  const sections = data?.console?.sections;

  return (
    <Panel variant="default" radius="panel" className="p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display-tight text-lg">Connected Apify surfaces</h3>
          {lastRefreshedAt ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Checked {formatCheckedAt(lastRefreshedAt)}
            </p>
          ) : null}
        </div>
        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit shrink-0"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh live Apify data"
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Checking…" : "Refresh live data"}
          </Button>
        ) : null}
      </div>

      {refreshError ? (
        <p className="text-destructive mt-4 text-xs" role="status">
          The last live refresh failed: {refreshError}
        </p>
      ) : null}

      <section
        className="border-border/80 mt-5 border-t pt-5"
        aria-labelledby="apify-api-surface-title"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h4 id="apify-api-surface-title" className="text-sm font-medium">
            API operations
          </h4>
          <SurfaceBadge
            label="API"
            configured={Boolean(data?.api?.configured)}
            available={apiAvailable}
          />
        </div>
        {apiAvailable ? (
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            {apiMetrics.map(({ key, label }) => (
              <SurfaceMetric
                key={key}
                label={label}
                value={data?.api?.inventory?.[key]}
                available
              />
            ))}
          </div>
        ) : (
          <SurfaceMessage>
            {data?.api?.configured
              ? "API inventory is unavailable. Check or replace the API key above."
              : "Add an API key above to load Actors, runs, and storage."}
          </SurfaceMessage>
        )}
      </section>

      <section
        className="border-border/80 mt-5 border-t pt-5"
        aria-labelledby="apify-console-surface-title"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h4 id="apify-console-surface-title" className="text-sm font-medium">
            Console operations
          </h4>
          <SurfaceBadge
            label="Console"
            configured={Boolean(data?.console?.configured)}
            available={consoleAvailable}
          />
        </div>
        {consoleAvailable ? (
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            <SurfaceMetric
              label="Organizations"
              value={sections?.organizations?.count}
              available={Boolean(sections?.organizations?.available)}
            />
            <SurfaceMetric
              label="Proxy cycles"
              value={sections?.proxy?.billingCycles}
              available={Boolean(sections?.proxy?.available)}
            />
            <SurfaceMetric
              label="Billing groups"
              value={sections?.billing?.serviceGroups}
              available={Boolean(sections?.billing?.available)}
            />
            <SurfaceMetric
              label="Apify notifications"
              value={sections?.notifications?.total}
              available={Boolean(sections?.notifications?.available)}
              detail={
                sections?.notifications?.available
                  ? `Apify Console feed · ${sections.notifications.unread ?? 0} unread`
                  : undefined
              }
            />
          </div>
        ) : (
          <SurfaceMessage>
            {data?.console?.configured
              ? "Console data could not be loaded. Reconnect the Apify session; the API key and API inventory can continue working."
              : "Connect your Apify browser session above to load organizations and account data."}
          </SurfaceMessage>
        )}
      </section>
    </Panel>
  );
}

function SurfaceBadge({
  label,
  configured,
  available,
}: {
  label: string;
  configured: boolean;
  available: boolean;
}) {
  return (
    <Badge
      className="whitespace-nowrap"
      variant={available ? "success" : configured ? "warning" : "outline"}
    >
      {label}: {available ? "live" : configured ? "unavailable" : "not configured"}
    </Badge>
  );
}

function SurfaceMetric({
  label,
  value,
  available,
  detail,
}: {
  label: string;
  value: number | null | undefined;
  available: boolean;
  detail?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-display-tight text-xl font-medium tabular-nums">
        {metricValue(value, available)}
      </p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
      {detail ? (
        <p className="text-muted-foreground mt-0.5 text-[11px] leading-4">{detail}</p>
      ) : null}
    </div>
  );
}

function SurfaceMessage({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mt-3 text-xs leading-5">{children}</p>;
}

function metricValue(value: number | null | undefined, available: boolean): string {
  if (!available || value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCheckedAt(value: Date): string {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value)} UTC`;
}
