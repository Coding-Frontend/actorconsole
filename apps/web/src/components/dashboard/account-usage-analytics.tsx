"use client";

import { ChartJsChart } from "@/components/charts/chartjs-chart";
import { ChartFrame, formatChartValue } from "@/components/charts/chart-system";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ServiceUsage {
  serviceKey?: string;
  quantity: number;
  baseAmountUsd: number;
  baseUnitPriceUsd: number;
}

interface MonthlyUsage {
  monthStartAt: string;
  serviceUsages: Record<string, ServiceUsage>;
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function labelForService(key: string) {
  return key
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const ACCOUNT_COST_SERIES = [
  {
    key: "cost",
    label: "Usage cost",
    color: "var(--color-signal-orange)",
    format: { unit: "currency" as const, currency: "USD" },
  },
] as const;

export function AccountUsageAnalytics({
  monthly,
  currentServices,
}: {
  monthly: Record<string, MonthlyUsage> | null;
  currentServices: Record<string, ServiceUsage[]> | null;
}) {
  const monthlyPoints = Object.entries(monthly ?? {})
    .map(([month, item]) => ({
      month,
      label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      cost: Object.values(item.serviceUsages ?? {}).reduce(
        (sum, usage) => sum + Number(usage.baseAmountUsd || 0),
        0,
      ),
    }))
    .sort((left, right) => left.month.localeCompare(right.month));
  const services = Object.entries(currentServices ?? {})
    .map(([key, rows]) => ({
      key,
      cost: rows.reduce((sum, row) => sum + Number(row.baseAmountUsd || 0), 0),
      quantity: rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    }))
    .filter((item) => item.cost > 0 || item.quantity > 0)
    .sort((left, right) => right.cost - left.cost);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm">Account cost history</CardTitle>
          <p className="text-xs text-muted-foreground">
            Monthly Apify service charges from the connected account.
          </p>
        </CardHeader>
        <CardContent>
          <ChartFrame
            ariaLabel="Monthly account usage cost history"
            series={ACCOUNT_COST_SERIES}
            status={monthlyPoints.some((point) => point.cost > 0) ? "ready" : "empty"}
            statusMessage="No monthly service charges were returned."
            options={{ showSeriesControls: false, compact: true }}
            chartClassName="h-72 min-w-0"
          >
            {(state) => (
              <ChartJsChart
                ariaLabel="Monthly account usage cost history"
                data={monthlyPoints}
                xKey="label"
                series={ACCOUNT_COST_SERIES}
                type="area"
                state={state}
                yAxis={{ formatValue: (value) => formatChartValue(value, { unit: "currency" }) }}
              />
            )}
          </ChartFrame>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Current billing-cycle services</CardTitle>
          <p className="text-xs text-muted-foreground">Highest-cost service categories first.</p>
        </CardHeader>
        <CardContent>
          {services.length ? (
            <div className="divide-y divide-border">
              {services.slice(0, 8).map((service) => (
                <div
                  key={service.key}
                  className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{labelForService(service.key)}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {service.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                      units
                    </p>
                  </div>
                  <p className="shrink-0 font-mono font-medium">{usd(service.cost)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-md border border-dashed px-6 text-center text-sm text-muted-foreground">
              No current service usage was returned.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
