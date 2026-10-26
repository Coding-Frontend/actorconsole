import { createHash } from "node:crypto";
import type { ApifyActorBasicInfo, ApifyActorDetail, ApifyPricingInfo } from "@actorconsole/apify";
import { APIFY_ACTOR_CATEGORIES } from "@actorconsole/shared";

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optimizationPricing(pricingInfos: ApifyPricingInfo[] | null | undefined) {
  const pricing = [...(pricingInfos ?? [])]
    .filter(
      (entry) =>
        entry.pricingModel === "PAY_PER_EVENT" &&
        (!entry.startedAt || Date.parse(entry.startedAt) <= Date.now()),
    )
    .sort(
      (left, right) => Date.parse(right.startedAt ?? "0") - Date.parse(left.startedAt ?? "0"),
    )[0];
  if (!pricing?.pricingPerEvent?.actorChargeEvents) return null;
  return {
    model: "PAY_PER_EVENT" as const,
    amount: null,
    currency: "USD" as const,
    events: pricing.pricingPerEvent.actorChargeEvents,
  };
}

function canonicalCategories(values: readonly string[] | null | undefined) {
  const canonical = new Set<string>(APIFY_ACTOR_CATEGORIES);
  const categories = (values ?? [])
    .map((category) => category.toUpperCase().replace(/[\s-]+/g, "_"))
    .filter((category): category is (typeof APIFY_ACTOR_CATEGORIES)[number] =>
      canonical.has(category),
    );
  return categories.length > 0 ? categories : ["OTHER" as const];
}

type OptimizationActor = Pick<
  ApifyActorDetail,
  "title" | "name" | "description" | "readme" | "inputSchema" | "outputSchema" |
  "pictureUrl" | "categories" | "pricingInfos"
>;

// Generation and application must hash the same snapshot, including the image.
// Keeping this construction shared prevents unchanged proposals becoming stale.
export function actorOptimizationState(
  actor: OptimizationActor,
  basicInfo: Pick<ApifyActorBasicInfo, "categories" | "pricingInfos">,
) {
  return {
    title: actor.title?.trim() || actor.name,
    description: actor.description?.trim() || "No description provided.",
    categories: canonicalCategories(basicInfo.categories ?? actor.categories),
    readme: actor.readme?.trim() || "",
    inputSchema: jsonObject(actor.inputSchema),
    outputSchema: jsonObject(actor.outputSchema),
    keyValueStoreSchema: null,
    imageUrl: actor.pictureUrl ?? null,
    pricing: optimizationPricing(basicInfo.pricingInfos ?? actor.pricingInfos),
  };
}

export function optimizationFingerprint(state: ReturnType<typeof actorOptimizationState>) {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}
