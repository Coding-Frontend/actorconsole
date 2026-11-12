import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Chart } from "chart.js";
import { Sparkline } from "@/components/admin/sparkline";
import { PlanDistributionChart } from "@/components/admin/plan-distribution-chart";
import { FinancialTrendChart } from "@/components/dashboard/financial-trend-chart";
import { InteractiveBarChart } from "@/components/marketing/interactive-bar-chart";
import { ChartFrame } from "@/components/charts/chart-system";
import { ChartJsChart } from "@/components/charts/chartjs-chart";
import { ComparisonCharts } from "@/components/comparison/comparison-charts";
import "@/app/globals.css";

declare global {
  interface Window {
    __chartJs: typeof Chart;
  }
}
window.__chartJs = Chart;

const days = Array.from({ length: 7 }, (_, index) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 6 + index);
  return date.toISOString().slice(0, 10);
});
const points = days.map((date, index) => ({
  period: date,
  date,
  runs: 8 + index * 3,
  successful: 7 + index * 3,
  failed: 1,
  revenueUsd: index === 3 ? null : index * 5.1,
  netProfitUsd: index === 3 ? null : index * 2.5 - 3,
  directCostUsd: index * 0.000001,
  accountCostUsd: 1 + index * 0.5,
  usageCostUsd: 1 + index * 0.5,
}));
const reliabilitySeries = [
  { key: "successful", label: "Succeeded", color: "var(--color-signal-green)", stack: "runs" },
  { key: "failed", label: "Failed", color: "var(--color-signal-orange)", stack: "runs" },
];

function Fixture() {
  const [selected, setSelected] = useState<string | null>(null);
  const [mounted, setMounted] = useState(true);
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold">Dashboard chart verification</h1>
        <button onClick={() => document.documentElement.classList.toggle("dark")}>
          Toggle theme
        </button>
        <button onClick={() => setMounted((value) => !value)}>Toggle charts</button>
        <output aria-label="Selected date">{selected ?? "No date selected"}</output>
      </div>
      {mounted && (
        <>
          <FinancialTrendChart
            kind="revenue"
            points={points}
            granularity="day"
            mode="absolute"
            compare={false}
            from={days[0]!}
            to={days.at(-1)!}
            selectedDay={selected}
            advancedCount={0}
            onSettingsChange={() => {}}
            onInspectDay={setSelected}
          />
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-md border bg-card p-4">
              <h2>Admin revenue trend</h2>
              <Sparkline
                data={points.map((point) => ({ x: point.date, y: point.accountCostUsd }))}
                valueFormatter="inr"
              />
            </section>
            <section className="rounded-md border bg-card p-4">
              <h2>Admin plan distribution</h2>
              <PlanDistributionChart free={60} pro={40} total={100} />
            </section>
          </div>
          <InteractiveBarChart
            label="Observed users"
            tone="blue"
            points={[
              { date: days[0]!, value: null },
              { date: days[1]!, value: 8, observed: false },
              { date: days[2]!, value: 0 },
              { date: days[3]!, value: 10, coverage: { known: 1, total: 2 } },
            ]}
          />
          <ChartFrame ariaLabel="Reliability" series={reliabilitySeries} chartClassName="h-64">
            {(state) => (
              <ChartJsChart
                ariaLabel="Stacked run reliability"
                data={points}
                xKey="date"
                series={reliabilitySeries}
                type="bar"
                state={state}
              />
            )}
          </ChartFrame>
          <ComparisonCharts
            kind="builder"
            window={30}
            items={[
              {
                id: "one",
                kind: "builder",
                title: "Builder One",
                subtitle: "@one",
                username: "one",
                window: 30,
                metrics: {
                  actorCount: 2,
                  recentRuns: 50,
                  earningsLow: 10,
                  earningsCentral: 20,
                  earningsHigh: 30,
                },
                history: days.map((date, index) => ({ date, users: 10 + index, runs: index * 5 })),
              },
              {
                id: "two",
                kind: "builder",
                title: "Builder Two",
                subtitle: "@two",
                username: "two",
                window: 30,
                metrics: {
                  actorCount: 3,
                  recentRuns: 30,
                  earningsLow: 5,
                  earningsCentral: 10,
                  earningsHigh: 15,
                },
                history: days.map((date, index) => ({ date, users: 8 + index, runs: index * 3 })),
              },
            ]}
          />
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
