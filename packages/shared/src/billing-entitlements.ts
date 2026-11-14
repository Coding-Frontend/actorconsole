/** Existing provider-specific period access policy, shared with expiry reconciliation. */
export const EXPIRING_SUBSCRIPTION_STATUSES = [
  "canceled",
  "cancelled",
  "completed",
  "on_hold",
  "unpaid",
  "incomplete_expired",
  "paused",
  "failed",
  "expired",
] as const;

export function providerSubscriptionPlan(
  provider: string,
  status: string,
  periodEnd: Date | null,
  now = new Date(),
  paymentBacked = false,
): "PRO" | "FREE" | null {
  const future = !!periodEnd && periodEnd > now;
  if (provider === "stripe") {
    return ["active", "trialing", "past_due"].includes(status) ||
      (["canceled", "unpaid", "incomplete_expired", "paused"].includes(status) && future)
      ? "PRO"
      : "FREE";
  }
  if (provider === "dodo") {
    return status === "active" ||
      (["on_hold", "cancelled", "failed", "expired"].includes(status) && future)
      ? "PRO"
      : "FREE";
  }
  if (provider === "codingfrontend") {
    return status === "active" && paymentBacked && future ? "PRO" : "FREE";
  }
  if (provider === "razorpay") {
    // Mandate authorization and checkout creation are not subscription payments.
    return paymentBacked && future && ["active", "pending", "cancelled", "completed"].includes(status)
      ? "PRO" : "FREE";
  }
  return null;
}

export function subscriptionBlocksCheckout(subscription: {
  status: string;
  currentPeriodEnd?: Date | null;
}) {
  return (
    [
      "open",
      "created",
      "authenticated",
      "active",
      "trialing",
      "pending",
      "past_due",
      "on_hold",
      "cancellation_pending",
      "checkout_pending",
    ].includes(subscription.status) ||
    (!!subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date())
  );
}
