import type { ActorEarnings } from "@actorconsole/shared/actor-earnings";
import { backendData } from "./backend-data";

export const researchSorts = {
  users: "Active users",
  trending: "New total users",
  runs: "Runs / 30 days",
  newest: "Recently published",
  rating: "Rating",
} as const;

export type ResearchSort = keyof typeof researchSorts;

export interface ResearchActor {
  earnings?: ActorEarnings;
  id: string;
  username: string;
  actorName: string;
  title: string | null;
  description: string | null;
  pictureUrl: string | null;
  users7Days: number | null;
  users30Days: number | null;
  users90Days: number | null;
  totalUsers: number | null;
  totalRuns: number | null;
  runs30Days: number | null;
  reviewRating: number | null;
  reviewCount: number | null;
  firstPublishedAt: Date | null;
  lastSeenAt: Date;
  categories: unknown;
  pricingInfos: unknown;
  baselineUsers: number | null;
  baselineAt: Date | null;
  newUsers: number | null;
}

export function researchFilters(input: Record<string, string | string[] | undefined>) {
  const text = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
  const parsed = Number(text("page"));
  return {
    query: text("q").trim().slice(0, 100),
    category: text("category").trim().slice(0, 80),
    sort: Object.hasOwn(researchSorts, text("sort"))
      ? (text("sort") as ResearchSort)
      : ("users" as ResearchSort),
    window: [7, 30, 90].includes(Number(text("window"))) ? Number(text("window")) : 30,
    page: Math.max(1, Math.min(10000, Math.floor(parsed) || 1)),
  };
}

export type ResearchFilters = ReturnType<typeof researchFilters>;

export function categoryNames(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return categoryNames(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function getResearchCategories(): Promise<string[]> { return backendData("research-categories"); }
export function getActorResearch(filters: ResearchFilters): Promise<{ actors: ResearchActor[]; total: number; page: number; pageSize: number }> { return backendData("research", [filters]); }
