import type { Plan } from "./types/user";

export const PLAN_ACTOR_LIMITS: Readonly<Record<Plan, number | null>> = {
  FREE: 50,
  PRO: null,
};

export const PLAN_MONTHLY_USER_LIMITS: Readonly<Record<Plan, number | null>> = {
  FREE: 500,
  PRO: null,
};

export function workspacePlanUsage(plan: string, actorCount: number, monthlyUsers: number | null) {
  const actorLimit = actorLimitForPlan(plan);
  const monthlyUserLimit =
    PLAN_MONTHLY_USER_LIMITS[plan as Plan] ??
    (plan === "PRO" ? null : PLAN_MONTHLY_USER_LIMITS.FREE);
  const actorLimitExceeded = actorLimit !== null && actorCount > actorLimit;
  const monthlyUserLimitExceeded =
    monthlyUserLimit !== null && monthlyUsers !== null && monthlyUsers > monthlyUserLimit;
  return {
    actorCount,
    monthlyUsers,
    actorLimit,
    monthlyUserLimit,
    actorLimitExceeded,
    monthlyUserLimitExceeded,
    upgradeRequired: actorLimitExceeded || monthlyUserLimitExceeded,
  };
}

export type WorkspacePlanUsage = ReturnType<typeof workspacePlanUsage>;

/** Advance notices do not change eligibility; Free remains usable at either exact limit. */
export function workspacePlanNotice(usage: WorkspacePlanUsage): "exceeded" | "near" | null {
  if (usage.upgradeRequired) return "exceeded";
  const nearActors = usage.actorLimit !== null && usage.actorCount >= usage.actorLimit * 0.8;
  const nearUsers =
    usage.monthlyUserLimit !== null &&
    usage.monthlyUsers !== null &&
    usage.monthlyUsers >= usage.monthlyUserLimit * 0.8;
  return nearActors || nearUsers ? "near" : null;
}

export function actorInventoryAudience(
  items: readonly {
    stats?: { totalUsers30Days?: number; monthlyUsers?: number } | null;
  }[],
) {
  const reported = items
    .map((actor) => actor.stats?.totalUsers30Days ?? actor.stats?.monthlyUsers)
    .filter(
      (count): count is number => typeof count === "number" && Number.isFinite(count) && count >= 0,
    );
  return {
    monthlyUsers:
      items.length === 0
        ? 0
        : reported.length
          ? reported.reduce((sum, count) => sum + count, 0)
          : null,
    monthlyUsersComplete: reported.length === items.length,
  };
}

export type PlanFeature =
  | "workspace_operations"
  | "keyword_research"
  | "keyword_watchlist"
  | "pricing_recommendations"
  | "pricing_management"
  | "ai_copy"
  | "publishing"
  | "mcp_access"
  | "usage_analytics";

export const PLAN_FEATURES: Readonly<Record<Plan, ReadonlySet<PlanFeature>>> = {
  FREE: new Set([
    "workspace_operations",
    "keyword_research",
    "keyword_watchlist",
    "usage_analytics",
    "pricing_recommendations",
    "pricing_management",
    "ai_copy",
    "publishing",
    "mcp_access",
  ]),
  PRO: new Set([
    "workspace_operations",
    "keyword_research",
    "keyword_watchlist",
    "pricing_recommendations",
    "pricing_management",
    "ai_copy",
    "publishing",
    "mcp_access",
    "usage_analytics",
  ]),
};

/** Marketing copy is kept beside the entitlement map so the landing page
 * cannot advertise a capability that the API does not grant. */
export const PLAN_MARKETING_FEATURES: Readonly<Record<Plan, readonly string[]>> = {
  FREE: [
    "Apify actor synchronization",
    "Store search and actor comparison",
    "Up to 50 tracked actors per workspace",
    "Up to 500 monthly users across your actors",
    "Usage reporting for your tracked actors",
    "AI-assisted listing copy and pricing workflows",
    "Publishing queues and status management",
    "Authenticated MCP access for AI agents",
  ],
  PRO: [
    "Everything in Free",
    "Unlimited tracked actors per workspace",
    "No monthly actor-user ceiling",
  ],
};

export function actorLimitForPlan(plan: string): number | null {
  return Object.prototype.hasOwnProperty.call(PLAN_ACTOR_LIMITS, plan)
    ? PLAN_ACTOR_LIMITS[plan as Plan]
    : PLAN_ACTOR_LIMITS.FREE;
}

export function planHasFeature(plan: string, feature: PlanFeature): boolean {
  const features = Object.prototype.hasOwnProperty.call(PLAN_FEATURES, plan)
    ? PLAN_FEATURES[plan as Plan]
    : PLAN_FEATURES.FREE;
  return features.has(feature);
}
