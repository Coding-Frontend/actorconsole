import "server-only";
import { PLAN_MARKETING_FEATURES, type Plan } from "@actorconsole/shared";
import { backendData } from "./backend-data";
export type PlanMarketingFeatureMap = Record<Plan, readonly string[]>;
export async function getPlanMarketingFeatures(): Promise<PlanMarketingFeatureMap> {
  try { return await backendData<PlanMarketingFeatureMap>("plan-features"); }
  catch { return { FREE: [...PLAN_MARKETING_FEATURES.FREE], PRO: [...PLAN_MARKETING_FEATURES.PRO] }; }
}
