/**
 * Shared types and helpers for payment gateway management.
 *
 * The PaymentGateway model is stored in Prisma; these types mirror it
 * for use in frontend/admin code without a DB import.
 */

export const PAYMENT_GATEWAY_KEYS = ["stripe", "razorpay", "dodo"] as const;
export type PaymentGatewayKey = (typeof PAYMENT_GATEWAY_KEYS)[number];
export type PaymentMode = "test" | "live";

export function paymentModeSettingKey(key: string, mode: PaymentMode): string {
  const separator = key.indexOf("_");
  return `${key.slice(0, separator)}_${mode}${key.slice(separator)}`;
}

export interface PaymentModeField {
  key: string;
  label: string;
  description: string;
  isSecret: boolean;
  configured: boolean;
  value?: string;
}

export interface PaymentModeProfile {
  mode: PaymentMode;
  fields: PaymentModeField[];
  billingOptions: ProBillingOption[];
  readiness: {
    ready: boolean;
    configuredKeys: string[];
    missingCredentials: string[];
    missingProducts: string[];
  };
}

export type BillingInterval = "month" | "year";
export interface ProBillingOption {
  interval: BillingInterval;
  amountMinor?: number;
  currency?: string;
}

/** Explicit intervals never fall back to a product with an unknown billing cycle. */
export function proCheckoutProductKey(gateway: PaymentGatewayKey, interval: BillingInterval) {
  if (interval !== "month" && interval !== "year")
    throw new Error("Choose monthly or yearly billing.");
  const base =
    gateway === "stripe"
      ? "stripe_price_id_pro"
      : gateway === "razorpay"
        ? "razorpay_plan_id_pro"
        : "dodo_product_id_pro";
  return `${base}_${interval}`;
}

export function gatewayProductKeys(gateway: PaymentGatewayKey) {
  return PAYMENT_GATEWAY_BY_KEY[gateway].productKeys.flatMap((key) => [
    `${key}_month`,
    `${key}_year`,
  ]);
}

export function currencyMinorUnitFactor(currency: string): number {
  const zero = new Set([
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "JPY",
    "KMF",
    "KRW",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ]);
  const three = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);
  return zero.has(currency.toUpperCase()) ? 1 : three.has(currency.toUpperCase()) ? 1000 : 100;
}

export interface PaymentGatewayDefinition {
  key: PaymentGatewayKey;
  name: string;
  enabled: boolean;
  sortOrder: number;
  credentialKeys: readonly string[];
  productKeys: readonly string[];
  callbackKey: string;
  webhookPath: string;
}

export const PAYMENT_GATEWAY_DEFAULTS: PaymentGatewayDefinition[] = [
  {
    key: "stripe",
    name: "Stripe",
    enabled: false,
    sortOrder: 10,
    credentialKeys: ["stripe_secret_key", "stripe_publishable_key", "stripe_webhook_secret"],
    productKeys: ["stripe_product_id_pro", "stripe_price_id_pro"],
    callbackKey: "stripe_callback_url",
    webhookPath: "/api/billing/webhooks/stripe",
  },
  {
    key: "razorpay",
    name: "Razorpay",
    enabled: true,
    sortOrder: 20,
    credentialKeys: ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"],
    productKeys: ["razorpay_plan_id_pro"],
    callbackKey: "razorpay_callback_url",
    webhookPath: "/api/razorpay/webhook",
  },
  {
    key: "dodo",
    name: "Dodo Payments",
    enabled: false,
    sortOrder: 30,
    credentialKeys: ["dodo_api_key", "dodo_webhook_secret"],
    productKeys: ["dodo_product_id_pro"],
    callbackKey: "dodo_callback_url",
    webhookPath: "/api/billing/webhooks/dodo",
  },
];

export const PAYMENT_GATEWAY_BY_KEY: Record<PaymentGatewayKey, PaymentGatewayDefinition> =
  Object.fromEntries(PAYMENT_GATEWAY_DEFAULTS.map((gateway) => [gateway.key, gateway])) as Record<
    PaymentGatewayKey,
    PaymentGatewayDefinition
  >;

/** Human-readable label for each gateway key. */
export function paymentGatewayLabel(key: string): string {
  const map: Record<string, string> = {
    stripe: "Stripe",
    razorpay: "Razorpay",
    dodo: "Dodo Payments",
  };
  return map[key] ?? key;
}

/** Check if a gateway key is recognised. */
export function isValidPaymentGateway(key: string): key is PaymentGatewayKey {
  return PAYMENT_GATEWAY_KEYS.includes(key as PaymentGatewayKey);
}
