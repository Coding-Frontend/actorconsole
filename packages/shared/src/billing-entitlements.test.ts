import { describe, expect, it } from "vitest";
import { providerSubscriptionPlan } from "./billing-entitlements.js";

describe("Razorpay payment-backed entitlements", () => {
  const now = new Date("2026-10-29T00:00:00Z");
  const future = new Date(now.getTime() + 86400_000);
  it.each(["created", "authenticated", "halted", "expired", "unknown"])(
    "never entitles %s",
    (status) => {
      expect(providerSubscriptionPlan("razorpay", status, future, now, false)).toBe("FREE");
      expect(providerSubscriptionPlan("razorpay", status, future, now, true)).toBe("FREE");
    },
  );
  it.each(["active", "pending", "cancelled", "completed"])(
    "requires a paid, unexpired period for %s",
    (status) => {
      expect(providerSubscriptionPlan("razorpay", status, future, now, true)).toBe("PRO");
      expect(providerSubscriptionPlan("razorpay", status, future, now, false)).toBe("FREE");
      expect(providerSubscriptionPlan("razorpay", status, null, now, true)).toBe("FREE");
      expect(providerSubscriptionPlan("razorpay", status, now, now, true)).toBe("FREE");
    },
  );
});
