import { createHmac } from "node:crypto";

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay sends `X-Razorpay-Signature` header which is `HMAC_SHA256(secret, body)`.
 * Returns true if the signature matches.
 *
 * Docs: https://razorpay.com/docs/webhooks/validate-test/
 */
export function verifyRazorpaySignature(
  body: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  // Length-safe compare — avoid leaking timing info
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verify a Razorpay checkout payment response.
 * After client-side payment, the browser receives:
 *   { razorpay_payment_id, razorpay_order_id, razorpay_signature }
 * We must reconstruct the signature and compare.
 *
 * expected_signature = HMAC_SHA256(key_secret, "payment_id|order_id")
 */
export function verifyRazorpayCheckout(
  paymentId: string,
  orderId: string,
  signature: string,
  keySecret: string,
): boolean {
  const payload = `${paymentId}|${orderId}`;
  const expected = createHmac("sha256", keySecret).update(payload, "utf8").digest("hex");
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export interface RazorpayPlanInput {
  period: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  item: {
    name: string;
    amount: number; // in paise (1 INR = 100 paise)
    currency: string;
    description?: string;
  };
  notes?: Record<string, string>;
}

export interface RazorpaySubscriptionInput {
  plan_id: string;
  customer_notify?: 0 | 1;
  quantity?: number;
  total_count?: number;
  notes?: Record<string, string>;
  start_at?: number; // unix timestamp
  expire_by?: number;
}

export interface RazorpayOrderInput {
  amount: number; // paise
  currency: string; // "INR"
  receipt?: string;
  notes?: Record<string, string>;
}

export interface RazorpayRefundInput {
  payment_id: string;
  amount?: number; // paise; partial if specified
  speed?: "normal" | "optimum";
  notes?: Record<string, string>;
}
