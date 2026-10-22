
import { db } from "@actorconsole/db";
import { PLAN_MARKETING_FEATURES, type Plan } from "@actorconsole/shared";

export type PlanMarketingFeatureMap = Record<Plan, readonly string[]>;

const plans: readonly Plan[] = ["FREE", "PRO"];

/**
 * Load pricing-page copy from the admin-managed database table. The shared
 * defaults remain a safe bootstrap fallback for static builds and for a
 * deployment that is starting before its migration/seed has run.
 */
export async function getPlanMarketingFeatures(): Promise<PlanMarketingFeatureMap> {
  const fallback: PlanMarketingFeatureMap = {
    FREE: [...PLAN_MARKETING_FEATURES.FREE],
    PRO: [...PLAN_MARKETING_FEATURES.PRO],
  };

  try {
    const [rows, configs] = await Promise.all([
      db.planMarketingFeature.findMany({
        orderBy: [{ plan: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { plan: true, label: true, enabled: true },
      }),
      db.planMarketingFeatureConfig.findMany({ select: { plan: true } }),
    ]);
    const byPlan = new Map<Plan, string[]>();
    for (const plan of plans) byPlan.set(plan, []);

    const configuredPlans = new Set<Plan>();
    for (const config of configs) configuredPlans.add(config.plan as Plan);
    for (const row of rows) {
      const plan = row.plan as Plan;
      configuredPlans.add(plan);
      if (row.enabled) byPlan.get(plan)?.push(row.label);
    }

    for (const plan of plans) {
      if (!configuredPlans.has(plan)) fallback[plan] = [...(fallback[plan] ?? [])];
      else fallback[plan] = byPlan.get(plan) ?? [];
    }
  } catch {
    // A pricing page should remain renderable during a rolling migration or
    // when the CMS table is temporarily unavailable.
  }

  return fallback;
}
