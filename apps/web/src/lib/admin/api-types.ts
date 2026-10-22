/** Shared types for admin API responses. */

export interface UsageCostItem {
  id?: string;
  actorId: string;
  date: string;
  usageCostUsd: number | string;
  runs: number;
  adjustmentUsd?: number | string | null;
  actor?: {
    actorName: string;
    apifyActorId: string;
  };
}

export interface UsageCostSummary {
  totalUsageCostUsd: number | string;
  totalRuns: number;
  avgDailyUsageCostUsd: number | string;
  daysWithData: number;
}
