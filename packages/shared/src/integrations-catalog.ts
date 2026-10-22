/**
 * Runtime-configurable integrations that are consumed through the encrypted
 * Integration table. Deployment-only environment variables are intentionally
 * excluded because editing them here would not affect a running service.
 */

export type IntegrationCategory = "payment" | "ai" | "email" | "apify";

export interface IntegrationDef {
  key: string;
  label: string;
  description: string;
  category: IntegrationCategory;
  isSecret: boolean;
  defaultValue?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  pattern?: string;
  maskPrefix?: number;
  testable?: boolean;
  testEndpoint?: string;
}

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  {
    key: "stripe_publishable_key",
    label: "Stripe Publishable Key",
    description: "Public Stripe key for client-side payment experiences.",
    category: "payment",
    isSecret: false,
    pattern: "^pk_(test|live)_[A-Za-z0-9_]+$",
    maskPrefix: 8,
  },
  {
    key: "stripe_secret_key",
    label: "Stripe Secret Key",
    description: "Server-only Stripe API key used for Checkout, products, and subscriptions.",
    category: "payment",
    isSecret: true,
    pattern: "^sk_(test|live)_[A-Za-z0-9_]+$",
    maskPrefix: 8,
    testable: true,
  },
  {
    key: "stripe_webhook_secret",
    label: "Stripe Webhook Signing Secret",
    description: "Signing secret for Stripe events sent to the ActorConsole webhook URL.",
    category: "payment",
    isSecret: true,
    pattern: "^whsec_[A-Za-z0-9_]+$",
  },
  {
    key: "stripe_product_id_pro",
    label: "Stripe Product ID (Pro)",
    description:
      "Stripe Product backing the Pro subscription. Can be created from Payment Gateways.",
    category: "payment",
    isSecret: false,
    pattern: "^prod_[A-Za-z0-9]+$",
  },
  {
    key: "stripe_price_id_pro",
    label: "Stripe Recurring Price ID (Pro)",
    description: "Recurring Stripe Price used by Pro subscription checkout.",
    category: "payment",
    isSecret: false,
    pattern: "^price_[A-Za-z0-9]+$",
  },
  {
    key: "stripe_callback_url",
    label: "Stripe Checkout Callback URL",
    description: "Customer return URL after Stripe Checkout succeeds or is cancelled.",
    category: "payment",
    isSecret: false,
    pattern: "^https?://.+$",
  },
  {
    key: "razorpay_key_id",
    label: "Razorpay Key ID",
    description: "Public Razorpay key used to initialize the hosted checkout.",
    category: "payment",
    isSecret: false,
    pattern: "^rzp_(test|live)_[A-Za-z0-9]+$",
    maskPrefix: 8,
    testable: true,
    testEndpoint: "/razorpay/test",
  },
  {
    key: "razorpay_key_secret",
    label: "Razorpay Key Secret",
    description: "Server-only key used to create and verify Razorpay operations.",
    category: "payment",
    isSecret: true,
    pattern: "^[A-Za-z0-9]{20,}$",
    maskPrefix: 4,
  },
  {
    key: "razorpay_webhook_secret",
    label: "Razorpay Webhook Secret",
    description: "HMAC secret used to verify inbound Razorpay webhooks.",
    category: "payment",
    isSecret: true,
  },
  {
    key: "razorpay_plan_id_pro",
    label: "Razorpay Plan ID (Pro)",
    description: "Razorpay plan identifier used for Pro subscriptions.",
    category: "payment",
    isSecret: false,
    pattern: "^plan_[A-Za-z0-9]+$",
  },
  {
    key: "razorpay_callback_url",
    label: "Razorpay Checkout Callback URL",
    description: "Customer return URL used after Razorpay subscription checkout.",
    category: "payment",
    isSecret: false,
    pattern: "^https?://.+$",
  },
  {
    key: "razorpay_product_credits_100_amount_paise",
    label: "Razorpay 100-credit price (paise)",
    description: "Server-authoritative INR amount for the 100-credit product.",
    category: "payment",
    isSecret: false,
    pattern: "^[1-9][0-9]{1,8}$",
  },
  {
    key: "dodo_api_key",
    label: "Dodo Payments API Key",
    description: "Server-only Dodo Payments key used for checkout, products, and subscriptions.",
    category: "payment",
    isSecret: true,
    pattern: "^\\S{20,}$",
    maskPrefix: 6,
    testable: true,
  },
  {
    key: "dodo_webhook_secret",
    label: "Dodo Payments Webhook Secret",
    description: "Standard Webhooks signing secret from Developer → Webhooks in Dodo Payments.",
    category: "payment",
    isSecret: true,
  },
  {
    key: "dodo_environment",
    label: "Dodo Payments Environment",
    description: "Use test mode while validating checkout, then switch to live mode.",
    category: "payment",
    isSecret: false,
    defaultValue: "test_mode",
    options: [
      { value: "test_mode", label: "Test mode" },
      { value: "live_mode", label: "Live mode" },
    ],
    pattern: "^(test_mode|live_mode)$",
  },
  {
    key: "dodo_brand_id",
    label: "Dodo Brand ID",
    description:
      "Actor Console brand for Pro plans. Connected products must belong to this brand when set.",
    category: "payment",
    isSecret: false,
    pattern: "^[A-Za-z0-9_-]{4,}$",
  },
  {
    key: "dodo_product_id_pro",
    label: "Dodo Subscription Product ID (Pro)",
    description:
      "Dodo recurring Product used by Pro checkout. Can be created from Payment Gateways.",
    category: "payment",
    isSecret: false,
    pattern: "^[A-Za-z0-9_-]{4,}$",
  },
  {
    key: "dodo_callback_url",
    label: "Dodo Checkout Callback URL",
    description: "Customer return URL after Dodo Payments checkout.",
    category: "payment",
    isSecret: false,
    pattern: "^https?://.+$",
  },
  {
    key: "openai_api_key",
    label: "OpenAI API Key",
    description: "Used by the configured OpenAI text provider.",
    category: "ai",
    isSecret: true,
    pattern: "^sk-[A-Za-z0-9_-]+$",
    maskPrefix: 7,
    testable: true,
  },
  {
    key: "gemini_api_key",
    label: "Gemini API Key",
    description: "Used by the configured Google Gemini text provider.",
    category: "ai",
    isSecret: true,
    pattern: "^[A-Za-z0-9_-]{20,}$",
    maskPrefix: 6,
    testable: true,
  },
  {
    key: "email_provider",
    label: "Email Provider",
    description: "Selects whether transactional email is delivered through Resend or SMTP.",
    category: "email",
    isSecret: false,
    defaultValue: "resend",
    options: [
      { value: "resend", label: "Resend" },
      { value: "smtp", label: "SMTP" },
    ],
    pattern: "^(resend|smtp)$",
  },
  {
    key: "resend_api_key",
    label: "Resend API Key",
    description: "Used for transactional email and contact-form delivery.",
    category: "email",
    isSecret: true,
    pattern: "^re_[A-Za-z0-9_-]+$",
    testable: true,
  },
  {
    key: "email_from_address",
    label: "Default From Address",
    description: "Verified sender identity used for outbound email.",
    category: "email",
    isSecret: false,
  },
  {
    key: "resend_webhook_secret",
    label: "Resend Webhook Secret",
    description: "Svix signing secret used to consume delivery, bounce, and complaint events.",
    category: "email",
    isSecret: true,
  },
  {
    key: "smtp_host",
    label: "SMTP Host",
    description: "Hostname of the SMTP server used for transactional email.",
    category: "email",
    isSecret: false,
    testable: true,
  },
  {
    key: "smtp_port",
    label: "SMTP Port",
    description: "SMTP server port, typically 587 for STARTTLS or 465 for implicit TLS.",
    category: "email",
    isSecret: false,
    defaultValue: "587",
    pattern: "^[0-9]{1,5}$",
  },
  {
    key: "smtp_secure",
    label: "SMTP Secure Connection",
    description: "Use implicit TLS. Enable this for port 465; leave disabled for STARTTLS on 587.",
    category: "email",
    isSecret: false,
    defaultValue: "false",
    options: [
      { value: "false", label: "Disabled (STARTTLS)" },
      { value: "true", label: "Enabled (TLS)" },
    ],
    pattern: "^(true|false)$",
  },
  {
    key: "smtp_username",
    label: "SMTP Username",
    description: "Username used to authenticate with the SMTP server.",
    category: "email",
    isSecret: true,
    maskPrefix: 3,
  },
  {
    key: "smtp_password",
    label: "SMTP Password",
    description: "Password or app password used to authenticate with the SMTP server.",
    category: "email",
    isSecret: true,
  },
  {
    key: "apify_api_token",
    label: "Platform Apify API Key",
    description:
      "Admin-managed Apify API key for Actor discovery, reads, builds, runs, metadata updates, and publication writes.",
    category: "apify",
    isSecret: true,
    pattern: "^apify_api_[A-Za-z0-9_-]+$",
    maskPrefix: 10,
    testable: true,
  },
  {
    key: "apify_ui_token",
    label: "Platform Apify UI Key",
    description:
      "Optional manual Console UI token. With valid Platform Apify Cookies, the UI token is obtained automatically. The API key is still required for Actor writes and publication.",
    category: "apify",
    isSecret: true,
    maskPrefix: 6,
    testable: true,
  },
  {
    key: "apify_cookies",
    label: "Platform Apify Cookies",
    description:
      "Preferred Console credential. The backend ApifyRT cookie automatically obtains a UI token for Store metadata, category feedback, pictures, and Console reads. The API key is still required for Actor writes and publication.",
    category: "apify",
    isSecret: true,
    testable: true,
  },
];

// Only explicit monthly/yearly IDs are editable or used for new checkout.
for (const key of [
  "stripe_product_id_pro",
  "stripe_price_id_pro",
  "razorpay_plan_id_pro",
  "dodo_product_id_pro",
]) {
  const base = INTEGRATION_CATALOG.find((item) => item.key === key)!;
  for (const interval of ["month", "year"] as const) {
    INTEGRATION_CATALOG.push({
      ...base,
      key: `${key}_${interval}`,
      label: `${base.label} — ${interval === "month" ? "Monthly" : "Yearly"}`,
      description: `Existing ${interval === "month" ? "monthly" : "yearly"} Pro checkout ID from the provider dashboard.`,
    });
  }
  INTEGRATION_CATALOG.splice(INTEGRATION_CATALOG.indexOf(base), 1);
}

export const INTEGRATION_BY_KEY: Record<string, IntegrationDef> = Object.fromEntries(
  INTEGRATION_CATALOG.map((definition) => [definition.key, definition]),
);

export function getIntegrationDef(key: string): IntegrationDef | undefined {
  return INTEGRATION_BY_KEY[key];
}

export function integrationsByCategory(): Record<IntegrationCategory, IntegrationDef[]> {
  const result: Record<IntegrationCategory, IntegrationDef[]> = {
    payment: [],
    ai: [],
    email: [],
    apify: [],
  };
  for (const definition of INTEGRATION_CATALOG) {
    result[definition.category].push(definition);
  }
  return result;
}
