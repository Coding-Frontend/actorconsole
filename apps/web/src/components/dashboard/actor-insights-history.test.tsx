import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActorInsightsHistory, actorInsightErrorMessage } from "./actor-insights-history";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("Actor Insights history", () => {
  afterEach(cleanup);

  it("renders stored monitoring, acquisition, and quality values", () => {
    render(
      <ActorInsightsHistory
        lastSyncAt="2026-08-12T10:00:00.000Z"
        syncStatus="COMPLETE"
        snapshots={[
          {
            id: "snapshot-1",
            capturedOn: "2026-08-12T00:00:00.000Z",
            capturedAt: "2026-08-12T10:00:00.000Z",
            syncStatus: "COMPLETE",
            totalRuns: 10,
            succeededRuns: 9,
            failedRuns: 1,
            successRate: 0.9,
            activeUsers: 7,
            uniqueStoreViewers: 25,
            consolePageViews: 40,
            usersWithRun: 5,
            qualityScore: 0.84,
            acquisition: {
              topReferrers: [{ origin: "google.com", trafficPercent: 55 }],
              topCountryCodes: [{ origin: "US", trafficPercent: 40 }],
            },
          },
        ]}
      />,
    );
    expect(screen.getByText("90.0%")).toBeTruthy();
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getByText("google.com")).toBeTruthy();
    expect(screen.getByText("US")).toBeTruthy();
    expect(screen.getByText("complete")).toBeTruthy();
  });

  it("deduplicates repeated Console permission errors into one actionable message", () => {
    const denied =
      'Apify Console request failed with HTTP 403: {"errorCode":"insufficient-permissions"}';
    expect(actorInsightErrorMessage(`${denied} | ${denied} | ${denied}`)).toBe(
      "Apify Console could not read this Actor in the selected workspace organization. Reconnect the Console credential with that organization selected, then sync again.",
    );
  });

  it("keeps the latest non-empty metric when today's acquisition snapshot has no run fields", () => {
    render(
      <ActorInsightsHistory
        snapshots={[
          {
            id: "today",
            capturedOn: "2026-08-13T00:00:00.000Z",
            capturedAt: "2026-08-13T10:00:00.000Z",
            syncStatus: "COMPLETE",
            totalRuns: null,
            succeededRuns: null,
            failedRuns: null,
            resultCount: null,
            successRate: null,
            activeUsers: null,
            uniqueStoreViewers: 12,
            consolePageViews: 20,
            usersWithRun: 4,
            qualityScore: null,
          },
          {
            id: "yesterday",
            capturedOn: "2026-08-12T00:00:00.000Z",
            capturedAt: "2026-08-12T10:00:00.000Z",
            syncStatus: "COMPLETE",
            totalRuns: 10,
            succeededRuns: 9,
            failedRuns: 1,
            resultCount: 50,
            successRate: 0.9,
            activeUsers: 7,
            uniqueStoreViewers: null,
            consolePageViews: null,
            usersWithRun: null,
            qualityScore: 0.84,
          },
        ]}
      />,
    );

    expect(screen.getByText("90.0%")).toBeTruthy();
    expect(screen.getByText("50")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });
});
