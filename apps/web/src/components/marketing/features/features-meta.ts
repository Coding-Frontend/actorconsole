import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  DollarSign,
  FileText,
  Search,
  TrendingUp,
  ListChecks,
} from "lucide-react";

export type FeatureMeta = {
  id: string;
  number: string;
  icon: LucideIcon;
  badge: string;
  title: string;
  body: string;
  tags: readonly string[];
};

/**
 * The single source of truth for the marketing feature register.
 * The homepage and features page consume this list so copy and plan labels
 * stay consistent between routes.
 */
export const demandKdMeta = {
  id: "demand-kd",
  number: "01",
  icon: Search,
  badge: "Free and Pro",
  title: "Store research & keyword watchlist",
  body: "Search Apify Store listings, inspect available demand and competition signals, and save keywords to revisit from your workspace.",
  tags: ["Store search", "Difficulty signals", "Saved keywords"],
} satisfies FeatureMeta;

export const aiCopyMeta = {
  id: "ai-listing-studio",
  number: "02",
  icon: FileText,
  badge: "Free and Pro",
  title: "AI listing studio",
  body: "Generate reviewed title and description proposals from Actor listing context before publishing any change. Store categories remain Apify-managed.",
  tags: ["AI copy", "Review before publish", "Listing context"],
} satisfies FeatureMeta;

export const smartPricingMeta = {
  id: "smart-pricing",
  number: "03",
  icon: DollarSign,
  badge: "Free and Pro",
  title: "Smart pricing",
  body: "Compare live Store listings, review a transparent median recommendation, and prepare the Apify pay-per-event configuration before publishing.",
  tags: ["Pay per event", "Live competitors", "Manual approval"],
} satisfies FeatureMeta;

export const scheduledPublishingMeta = {
  id: "scheduled-publishing",
  number: "04",
  icon: CalendarDays,
  badge: "Free and Pro",
  title: "Publishing schedules",
  body: "Publish ordered Actor queues daily while respecting Apify limits and preserving run history.",
  tags: ["Publishing queue", "Daily window", "Run history"],
} satisfies FeatureMeta;

export const actorLifecycleMeta = {
  id: "actor-lifecycle",
  number: "05",
  icon: ListChecks,
  badge: "Free and Pro",
  title: "Actor publishing & lifecycle",
  body: "Check publishing readiness and change maintenance or deprecated status for selected Actors.",
  tags: ["Publishing", "Readiness checks", "Bulk status changes"],
} satisfies FeatureMeta;

export const usageAnalyticsMeta = {
  id: "usage-analytics",
  number: "06",
  icon: BarChart3,
  badge: "Free and Pro",
  title: "Usage-cost analytics",
  body: "Understand the Apify platform costs incurred by each actor, with run totals and time-window comparisons.",
  tags: ["Usage costs", "Per-actor breakdown", "Trend charts"],
} satisfies FeatureMeta;

export const revenueAnalyticsMeta = {
  id: "revenue-analytics",
  number: "07",
  icon: TrendingUp,
  badge: "Free and Pro",
  title: "Revenue & profit reporting",
  body: "Compare creator revenue with Actor costs by day and Actor. Profit and margin appear when the selected period has both monetization and cost data from Apify.",
  tags: ["Creator revenue", "Actor profit", "Data coverage shown"],
} satisfies FeatureMeta;

export const featureMeta = [
  demandKdMeta,
  aiCopyMeta,
  smartPricingMeta,
  scheduledPublishingMeta,
  actorLifecycleMeta,
  usageAnalyticsMeta,
  revenueAnalyticsMeta,
] as const;
