import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActorQualityPanel, ActorRevenuePerformance } from "./actor-owner-analytics";
import { persistedOwnerAnalyticsFromSnapshots } from "./actor-owner-analytics-data";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Area: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("Actor revenue performance", () => {
  afterEach(cleanup);

  it("uses Apify actor-breakdown earnings instead of an inconsistent aggregate", () => {
    render(
      <ActorRevenuePerformance
        analytics={[
          {
            actorBreakdown: {
              monetizationPerActor: [
                {
                  earningsStats: {
                    totalRevenueUsd: 11.381192,
                    totalCostUsd: 0,
                    totalProfitUsd: 11.381192,
                  },
                  usersStats: { freeUsers: 38, payingUsers: 16 },
                  chargedResults: 5450,
                },
              ],
            },
            profitMargin: {
              totalProfitMarginStats: {
                payingUsersUsd: {
                  revenueUsd: 32.59196,
                  costUsd: 0,
                  profitUsd: 32.59196,
                  margin: 1,
                },
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getAllByText("$11.38")).toHaveLength(2);
    expect(screen.queryByText("$32.59")).toBeNull();
    expect(screen.getByText("100.0%")).toBeTruthy();
    expect(screen.getByText(/16 paying users/)).toBeTruthy();
  });

  it("preserves actor-breakdown earnings when rebuilding database-first analytics", () => {
    const analytics = persistedOwnerAnalyticsFromSnapshots([
      {
        capturedOn: "2026-08-13T00:00:00.000Z",
        costUsd: null,
        revenueUsd: null,
        profitUsd: null,
        profitMargin: null,
        monetization: {
          totalProfitMarginStats: {
            payingUsersUsd: {
              revenueUsd: 11.381192,
              costUsd: 0,
              profitUsd: 11.381192,
              margin: 1,
            },
            allUsersUsd: {
              revenueUsd: 32.59196,
              costUsd: 0,
              profitUsd: 32.59196,
              margin: 1,
            },
          },
          actorBreakdown: {
            monetizationPerActor: [
              {
                earningsStats: {
                  totalRevenueUsd: 11.381192,
                  totalCostUsd: 0,
                  totalProfitUsd: 11.381192,
                },
                usersStats: { freeUsers: 38, payingUsers: 16 },
                chargedResults: 5450,
              },
            ],
          },
        },
      },
    ]);

    render(<ActorRevenuePerformance analytics={analytics} />);

    expect(screen.getAllByText("$11.38")).toHaveLength(2);
    expect(screen.getByText(/5,450 charged results/)).toBeTruthy();
    expect(screen.getByText(/16 paying users/)).toBeTruthy();
  });
});

describe("Actor quality panel", () => {
  afterEach(cleanup);

  it("uses the latest saved Insights score when live quality details are unavailable", () => {
    render(<ActorQualityPanel quality={null} snapshotScore={0.692} />);

    expect(screen.getByText("69.2%")).toBeTruthy();
    expect(screen.getByText(/Latest saved Apify Insights score/)).toBeTruthy();
    expect(screen.queryByText("Quality score unavailable")).toBeNull();
  });
});
