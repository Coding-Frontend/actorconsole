/**
 * Map Apify DTOs to the app's domain DTOs (defined in
 * `@actorconsole/shared`). Use this in route handlers and pages when you
 * want to feed a DB-shaped `ActorSummary` / `ActorDetail` into a UI
 * component instead of the raw Apify shape.
 */

import type { ActorCategory, ActorDetail, ActorSummary } from "@actorconsole/shared";
import type { ApifyActorDetail, ApifyActorSummary } from "./types";

function normalizeCategories(input: string[] | undefined): ActorCategory[] {
  if (!input) return [];
  // Apify can add Store categories without a client release. Preserve those
  // values verbatim (apart from whitespace) instead of silently collapsing
  // new categories into OTHER.
  return [...new Set(input.map((value) => value.trim()).filter(Boolean))];
}

export function toActorSummary(a: ApifyActorSummary): ActorSummary {
  return {
    id: a.id,
    apifyActorId: `${a.username}/${a.name}`,
    username: a.username,
    actorName: a.name,
    title: a.title,
    description: a.description,
    imageUrl: a.pictureUrl,
    totalRuns: a.stats?.totalRuns ?? null,
    usersTotal: a.stats?.totalUsers ?? a.totalUsers ?? null,
    rating: a.stats?.rating ?? null,
    isPublic: a.isPublic,
    categories: normalizeCategories(a.categories),
  };
}

export function toActorDetail(a: ApifyActorDetail): ActorDetail {
  const base = toActorSummary(a);
  return {
    ...base,
    readme: a.readme,
    seoTitle: a.seoTitle,
    seoDescription: a.seoDescription,
    pricing: a.pricingInfos?.[0]
      ? {
          model: a.pricingInfos[0].pricingModel,
          amount: a.pricingInfos[0].pricePerUnitUsd ?? null,
          currency: "USD" as const,
          ...(a.pricingInfos[0].unitName ? { unitName: a.pricingInfos[0].unitName } : {}),
          ...(a.pricingInfos[0].trialMinutes != null
            ? { trialMinutes: a.pricingInfos[0].trialMinutes }
            : {}),
          ...(a.pricingInfos[0].pricingPerEvent?.actorChargeEvents
            ? { events: a.pricingInfos[0].pricingPerEvent.actorChargeEvents }
            : {}),
        }
      : null,
    language: "other", // inferred by shared `inferActorLanguage`; see below
    inputSchema: a.inputSchema,
    outputSchema: a.outputSchema,
    createdAt: a.createdAt ?? "",
    updatedAt: a.modifiedAt ?? "",
  };
}
