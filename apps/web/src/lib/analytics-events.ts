"use client";

import { getConsent } from "@/components/cookie-consent";

// Keep event data limited to bounded product attributes; never pass user text,
// credentials, actor identifiers, or payment details.
type AnalyticsEvents = {
  login: { method: "email" | "google" | "github" };
  sign_up: { method: "email" };
  generate_lead: { form: "contact" };
  begin_checkout: {
    currency?: string;
    value?: number;
    items: Array<{ item_id: "pro"; item_name: "Pro"; item_variant: "month" | "year" }>;
  };
  workspace_created: Record<string, never>;
  onboarding_completed: Record<string, never>;
  apify_connected: { method: "api_key" | "console" | "extension" };
  actor_optimization_started: { kind: "CUSTOM" | "GENERATE_IMPROVEMENTS" };
  actor_optimization_approved: { queued_count: number };
  actor_copy_generated: Record<string, never>;
  actor_copy_applied: Record<string, never>;
  publishing_schedule_created: { actor_count: number; enabled: 0 | 1 };
  bulk_actor_operation_started: { actor_count: number };
  financial_sync_started: { scope: "usage" | "costs" | "revenue" };
};

export async function trackEvent<T extends keyof AnalyticsEvents>(
  name: T,
  params: AnalyticsEvents[T],
) {
  if (getConsent() !== "all") return;
  try {
    const { logFirebaseEvent } = await import("@/lib/firebase");
    await logFirebaseEvent(name, params);
  } catch {
    // Analytics must never interrupt the user's action.
  }
}

/** Allow a short delivery window before a full-page navigation. */
export async function trackEventBeforeNavigation<T extends keyof AnalyticsEvents>(
  name: T,
  params: AnalyticsEvents[T],
) {
  await Promise.race([
    trackEvent(name, params),
    new Promise<void>((resolve) => setTimeout(resolve, 300)),
  ]);
}
