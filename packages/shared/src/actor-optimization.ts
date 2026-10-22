import { z } from "zod";

export const APIFY_ACTOR_CATEGORIES = [
  "AGENTS",
  "AI",
  "AUTOMATION",
  "BUSINESS",
  "DEVELOPER_TOOLS",
  "ECOMMERCE",
  "EDUCATION",
  "FOR_CREATORS",
  "GAMES",
  "INTEGRATIONS",
  "JOBS",
  "LEAD_GENERATION",
  "MARKETING",
  "MCP_SERVERS",
  "NEWS",
  "OPEN_SOURCE",
  "OTHER",
  "REAL_ESTATE",
  "SEO_TOOLS",
  "SOCIAL_MEDIA",
  "SPORTS",
  "TRAVEL",
  "VIDEOS",
] as const;

export type ActorOptimizationCategory = (typeof APIFY_ACTOR_CATEGORIES)[number];

export type ActorOptimizationField =
  | "title"
  | "description"
  | "pricing";

export const ACTOR_OPTIMIZATION_FIELDS = [
  "title",
  "description",
  "pricing",
] as const satisfies readonly ActorOptimizationField[];

export const actorOptimizationCategorySchema = z.enum(APIFY_ACTOR_CATEGORIES);
export const actorOptimizationFieldSchema = z.enum(ACTOR_OPTIMIZATION_FIELDS);

const optimizationPricingEventSchema = z.object({
  eventPriceUsd: z.number().nonnegative(),
  eventTitle: z.string().min(1),
  eventDescription: z.string().optional(),
  isOneTimeEvent: z.boolean().optional(),
  isPrimaryEvent: z.boolean().optional(),
});

export const actorOptimizationPricingSchema = z.object({
  model: z.literal("PAY_PER_EVENT"),
  amount: z.number().nonnegative().nullable().default(null),
  currency: z.literal("USD").default("USD"),
  events: z.record(z.string().min(1), optimizationPricingEventSchema),
});

export const actorListingStateSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  // Apify owns marketplace category assignment. Keep the value in the
  // read-only listing snapshot for backwards compatibility, but never make
  // it a generated or approvable optimization field.
  categories: z.array(actorOptimizationCategorySchema).max(4).optional().default([]),
  readme: z.string().max(50_000),
  inputSchema: z.record(z.unknown()).nullable().optional(),
  outputSchema: z.record(z.unknown()).nullable().optional(),
  keyValueStoreSchema: z.record(z.unknown()).nullable().optional(),
  pricing: actorOptimizationPricingSchema.nullable().optional(),
});

export type ActorListingState = z.infer<typeof actorListingStateSchema>;

export type ActorListingScoreBreakdown = {
  title: number;
  description: number;
  categories: number;
  readme: number;
  total: number;
};

const genericTitlePattern = /^(actor|scraper|crawler|api|automation|tool)$/i;
const outcomePattern =
  /\b(get|extract|collect|monitor|find|search|scrape|download|convert|track|automate|generate|analyze)\b/i;

function headingCount(readme: string): number {
  return new Set(
    [...readme.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].trim().toLowerCase()),
  ).size;
}

/** Transparent 0–100 listing-quality score. It is not a traffic or revenue forecast. */
export function scoreActorListing(input: {
  title?: string | null;
  description?: string | null;
  categories?: readonly string[] | null;
  readme?: string | null;
}): ActorListingScoreBreakdown {
  const title = input.title?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const categories = input.categories ?? [];
  const readme = input.readme?.trim() ?? "";

  let titleScore = title ? 4 : 0;
  if (title.length >= 30 && title.length <= 80) titleScore += 6;
  else if (title.length >= 15 && title.length <= 100) titleScore += 3;
  if (title.split(/\s+/).filter(Boolean).length >= 3) titleScore += 4;
  if (title && !genericTitlePattern.test(title)) titleScore += 3;
  if (outcomePattern.test(title) || outcomePattern.test(description)) titleScore += 3;

  let descriptionScore = description ? 4 : 0;
  if (description.length >= 100 && description.length <= 300) descriptionScore += 6;
  else if (description.length >= 50 && description.length <= 500) descriptionScore += 3;
  if (outcomePattern.test(description)) descriptionScore += 4;
  if (description.split(/\s+/).filter(Boolean).length >= 12) descriptionScore += 3;
  if (!/\b(revolutionary|amazing|best ever|game[- ]changer)\b/i.test(description)) {
    descriptionScore += description ? 3 : 0;
  }

  let categoryScore = categories.length > 0 ? 6 : 0;
  if (categories.length >= 2 && categories.length <= 4) categoryScore += 5;
  const canonical = new Set<string>(APIFY_ACTOR_CATEGORIES);
  if (categories.length > 0 && categories.every((category) => canonical.has(category))) {
    categoryScore += 4;
  }

  let readmeScore = readme ? 5 : 0;
  if (readme.length >= 1_000) readmeScore += 8;
  else if (readme.length >= 500) readmeScore += 4;
  const headings = headingCount(readme);
  readmeScore += Math.min(10, headings * 2);
  if (/##\s+input\b/i.test(readme)) readmeScore += 5;
  if (/##\s+output\b/i.test(readme)) readmeScore += 5;
  if (/##\s+(how to use|usage|examples?)\b/i.test(readme)) readmeScore += 5;
  if (/```[\s\S]*?```/.test(readme)) readmeScore += 4;
  if (/##\s+(faq|pricing)\b/i.test(readme)) readmeScore += 3;

  const breakdown = {
    title: Math.min(20, titleScore),
    description: Math.min(20, descriptionScore),
    categories: Math.min(15, categoryScore),
    readme: Math.min(45, readmeScore),
  };
  return { ...breakdown, total: Object.values(breakdown).reduce((sum, value) => sum + value, 0) };
}

export function listingImprovement(currentScore: number, proposedScore: number) {
  const points = Math.max(0, proposedScore - currentScore);
  return {
    points,
    percent:
      currentScore > 0 ? Math.round((points / currentScore) * 1_000) / 10 : points > 0 ? 100 : 0,
  };
}
