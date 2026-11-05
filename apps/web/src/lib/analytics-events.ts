"use client";

import { getConsent } from "@/components/cookie-consent";
import { analyticsPageContext } from "@/lib/analytics-path";

type AuthMethod = "email" | "google" | "github";
type CheckoutContext = {
  gateway: "stripe" | "razorpay" | "dodo";
  payment_mode: "live" | "test" | "unknown";
  billing_interval: "month" | "year";
};

// Keep event data limited to bounded product attributes; never pass user text,
// credentials, actor identifiers, or payment details.
type AnalyticsEvents = {
  login: { method: AuthMethod };
  sign_up: { method: AuthMethod };
  sign_up_requested: { method: "email" };
  email_verified: { method: "email" };
  generate_lead: { form: "contact" };
  newsletter_signup_requested: Record<string, never>;
  select_plan: {
    plan: "FREE" | "PRO";
    billing_interval?: "month" | "year";
    source: "pricing" | "billing";
  };
  begin_checkout: CheckoutContext & {
    currency?: string;
    value?: number;
    items: Array<{
      item_id: "pro";
      item_name: "Pro";
      item_variant: "month" | "year";
      price?: number;
      quantity: 1;
    }>;
  };
  checkout_redirected: CheckoutContext;
  checkout_failed: CheckoutContext & {
    reason: "network" | "provider" | "invalid_response";
  };
  subscription_cancelled: { payment_mode: "live" | "test" | "unknown" };
  workspace_created: Record<string, never>;
  onboarding_step_completed: { step: "workspace" | "credentials" | "plan" };
  onboarding_completed: Record<string, never>;
  apify_connected: { method: "api_key" | "console" | "extension" };
  actor_optimization_started: { kind: "CUSTOM" | "GENERATE_IMPROVEMENTS" };
  actor_optimization_approved: { queued_count: number };
  actor_copy_generated: Record<string, never>;
  actor_copy_applied: Record<string, never>;
  publishing_schedule_created: { actor_count: number; enabled: 0 | 1 };
  bulk_actor_operation_started: { actor_count: number };
  financial_sync_started: { scope: "usage" | "costs" | "revenue" };
  keyword_search: { result_count: number };
  watchlist_updated: {
    item_type: "actor" | "keyword";
    action: "added" | "removed" | "alerts_changed";
    alerts_enabled?: 0 | 1;
  };
  seo_audit_completed: { score: number };
  seo_audit_failed: { reason: "timeout" | "request_failed" };
  data_exported: {
    format: "csv";
    export_type: "pricing_scenario" | "seo_audit" | "watchlist";
    row_count: number;
  };
  support_ticket_created: {
    category: "BILLING" | "TECHNICAL" | "ACCOUNT" | "FEATURE_REQUEST" | "OTHER";
  };
};

async function sendEvent<T extends keyof AnalyticsEvents>(
  name: T,
  params: AnalyticsEvents[T],
  waitForDelivery = false,
) {
  try {
    if (typeof window === "undefined" || getConsent() !== "all") return;
    // Capture the originating route before loading Firebase or navigating.
    const page = analyticsPageContext(
      window.location.pathname,
      window.location.origin,
    );
    const { logFirebaseEvent } = await import("@/lib/firebase");
    await logFirebaseEvent(name, { ...params, ...page }, { waitForDelivery });
  } catch {
    // Analytics must never interrupt the user's action.
  }
}

export async function trackEvent<T extends keyof AnalyticsEvents>(
  name: T,
  params: AnalyticsEvents[T],
) {
  await sendEvent(name, params);
}

/** Allow a short delivery window before a full-page navigation. */
export async function trackEventBeforeNavigation<
  T extends keyof AnalyticsEvents,
>(name: T, params: AnalyticsEvents[T]) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sendEvent(name, params, true),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 300);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
