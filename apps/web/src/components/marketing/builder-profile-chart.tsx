"use client";

import { ObservedMetricBarChart } from "@/components/marketing/observed-metric-bar-chart";
import { InteractiveBarChart } from "@/components/marketing/interactive-bar-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PublishingPoint = { date: string; actors: number };
type TrendPoint = {
  date: string;
  observed: boolean;
  users: number | null;
  runs: number | null;
};

export function BuilderProfileChart({
  publishing,
  trends,
  window,
}: {
  publishing: PublishingPoint[];
  trends: TrendPoint[];
  window: number;
}) {
  return (
    <Tabs defaultValue="actors" className="mt-6">
      <TabsList className="h-auto w-full justify-start overflow-x-auto p-1 sm:w-auto">
        <TabsTrigger value="actors" className="whitespace-nowrap">
          New Actors
        </TabsTrigger>
        <TabsTrigger value="users" className="whitespace-nowrap">
          Active users
        </TabsTrigger>
        <TabsTrigger value="runs" className="whitespace-nowrap">
          30-day runs
        </TabsTrigger>
      </TabsList>
      <TabsContent value="actors" className="mt-6">
        <DailyBarChart
          points={publishing.map((point) => ({ date: point.date, value: point.actors }))}
          label="Actors published"
          emptyMessage={`No new public Actors were detected during this ${window}-day window.`}
        />
      </TabsContent>
      <TabsContent value="users" className="mt-6">
        <ObservedMetricBarChart
          points={trends.map((point) => ({
            date: point.date,
            value: point.users,
            observed: point.observed,
          }))}
          label="Active users"
          tone="blue"
          emptyMessage="Daily Store snapshots are collected automatically. The first captured UTC day will appear here."
        />
      </TabsContent>
      <TabsContent value="runs" className="mt-6">
        <ObservedMetricBarChart
          points={trends.map((point) => ({
            date: point.date,
            value: point.runs,
            observed: point.observed,
          }))}
          label="30-day runs"
          tone="orange"
          emptyMessage="Daily Store snapshots are collected automatically. The first captured UTC day will appear here."
        />
      </TabsContent>
    </Tabs>
  );
}

function DailyBarChart({
  points,
  label,
  emptyMessage,
}: {
  points: Array<{ date: string; value: number }>;
  label: string;
  emptyMessage: string;
}) {
  if (points.length === 0) {
    return <TrendBaseline capturedDays={0} totalDays={0} message={emptyMessage} />;
  }

  const hasValues = points.some((point) => point.value > 0);
  const total = points.reduce((sum, point) => sum + point.value, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-kicker">Daily publishing</p>
          <p className="font-display-tight mt-1 text-3xl tabular-nums">
            {total.toLocaleString("en-IN")}
          </p>
        </div>
        <p className="text-muted-foreground text-xs">Each bar represents one UTC day.</p>
      </div>
      <InteractiveBarChart points={points} label={label} tone="blue" />
      {!hasValues ? (
        <p className="text-muted-foreground mt-5 text-center text-sm">{emptyMessage}</p>
      ) : null}
    </div>
  );
}

function TrendBaseline({
  capturedDays,
  totalDays,
  message,
}: {
  capturedDays: number;
  totalDays: number;
  message: string;
}) {
  return (
    <div className="border-border bg-muted/25 border border-dashed px-5 py-14 text-center">
      <p className="font-semibold">Trend baseline is forming</p>
      <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm leading-6">{message}</p>
      {totalDays > 0 ? (
        <p className="type-kicker mt-5">
          {capturedDays} of {totalDays} days captured
        </p>
      ) : null}
    </div>
  );
}
