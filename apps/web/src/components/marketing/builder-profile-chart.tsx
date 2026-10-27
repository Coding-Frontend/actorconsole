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
  usersCoverage?: { known: number; total: number };
  runsCoverage?: { known: number; total: number };
};

export function BuilderProfileChart({
  discoveries = [],
  actorConsolePublishing = [],
  trends,
  window,
}: {
  discoveries?: PublishingPoint[];
  actorConsolePublishing?: PublishingPoint[];
  trends: TrendPoint[];
  window: number;
}) {
  return (
    <Tabs defaultValue="actors" className="mt-6">
      <TabsList className="h-auto w-full justify-start overflow-x-auto p-1 sm:w-auto">
        <TabsTrigger value="actors" className="whitespace-nowrap">
          New Actors
        </TabsTrigger>
        <TabsTrigger value="published" className="whitespace-nowrap">
          Published via ActorConsole
        </TabsTrigger>
        <TabsTrigger value="users" className="whitespace-nowrap">
          Active users / 30d
        </TabsTrigger>
        <TabsTrigger value="runs" className="whitespace-nowrap">
          30-day runs
        </TabsTrigger>
      </TabsList>
      <TabsContent value="actors" className="mt-6">
        <p className="mb-4 text-xs text-muted-foreground">
          Actors first observed in the public catalog. This is the discovery date, not the
          publication date. Initial catalog imports and delayed checks can group older Actors
          together; a zero means none were first observed that day.
        </p>
        <DailyBarChart
          points={discoveries.map((point) => ({ date: point.date, value: point.actors }))}
          heading="Daily discoveries"
          label="Actors first observed"
          emptyMessage={`No Actors were first observed during this ${window}-day window.`}
        />
      </TabsContent>
      <TabsContent value="published" className="mt-6">
        <p className="mb-4 text-xs text-muted-foreground">
          Successful publication events recorded by ActorConsole. These may include republications
          and do not include Actors published elsewhere or events before recording began.
        </p>
        <DailyBarChart
          points={actorConsolePublishing.map((point) => ({
            date: point.date,
            value: point.actors,
          }))}
          heading="ActorConsole publication events"
          label="Publication events"
          emptyMessage={`No ActorConsole publication events were recorded during this ${window}-day window.`}
        />
      </TabsContent>
      <TabsContent value="users" className="mt-6">
        <p className="mb-4 text-xs text-muted-foreground">
          History shows rolling 30-day user counts. The selected window controls the dates shown.
        </p>
        <ObservedMetricBarChart
          points={trends.map((point) => ({
            date: point.date,
            value: point.users,
            observed: point.observed,
            coverage: point.usersCoverage,
          }))}
          label="Active users / 30d"
          tone="blue"
          emptyMessage="No complete portfolio snapshots were recorded for these dates."
        />
      </TabsContent>
      <TabsContent value="runs" className="mt-6">
        <ObservedMetricBarChart
          points={trends.map((point) => ({
            date: point.date,
            value: point.runs,
            observed: point.observed,
            coverage: point.runsCoverage,
          }))}
          label="30-day runs"
          tone="orange"
          emptyMessage="No complete portfolio snapshots were recorded for these dates."
        />
      </TabsContent>
    </Tabs>
  );
}

function DailyBarChart({
  points,
  heading,
  label,
  emptyMessage,
}: {
  points: Array<{ date: string; value: number }>;
  heading: string;
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
          <p className="type-kicker">{heading}</p>
          <p className="font-display-tight mt-1 text-3xl tabular-nums">
            {total.toLocaleString("en-IN")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Each bar represents one UTC day.</p>
      </div>
      <InteractiveBarChart points={points} label={label} tone="blue" />
      {!hasValues ? (
        <p className="mt-5 text-center text-sm text-muted-foreground">{emptyMessage}</p>
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
    <div className="border border-dashed border-border bg-muted/25 px-5 py-14 text-center">
      <p className="font-semibold">Trend baseline is forming</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{message}</p>
      {totalDays > 0 ? (
        <p className="type-kicker mt-5">
          {capturedDays} of {totalDays} days captured
        </p>
      ) : null}
    </div>
  );
}
