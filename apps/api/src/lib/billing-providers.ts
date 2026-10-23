import DodoPayments from "dodopayments";
import Razorpay from "razorpay";
import Stripe from "stripe";
import {
  PAYMENT_GATEWAY_BY_KEY,
  gatewayProductKeys,
  proCheckoutProductKey,
  type BillingInterval,
  type ProBillingOption,
  type PaymentGatewayKey,
  type Plan,
  type PaymentMode,
} from "@actorconsole/shared";
import {
  getGatewayContext,
  getPaymentSetting,
  setPaymentSetting,
  legacyGatewayMode,
  validatePaymentSetting,
  type GatewayContext,
} from "./payment-gateway-settings.js";
import { apiEnv } from "../config/env.js";
import { isDodoLivePaymentsUnavailable } from "./billing-provider-errors.js";

export interface CheckoutActor {
  userId: string;
  businessProfileId: string;
  email: string;
  name?: string | null;
}

export interface CheckoutResult {
  gateway: PaymentGatewayKey;
  billingMode: PaymentMode;
  checkoutId: string;
  checkoutUrl: string;
  providerSubscriptionId?: string | null;
  providerProductId: string;
  status: string;
}

export interface ProductInput {
  plan: Extract<Plan, "PRO">;
  name: string;
  description?: string;
  amountMinor: number;
  currency: string;
  interval: "month" | "year";
}

function callbackWithState(callback: string, gateway: PaymentGatewayKey, state: string): string {
  const url = new URL(callback);
  url.searchParams.set("checkout", state);
  url.searchParams.set("gateway", gateway);
  return url.toString();
}

async function contextFor(gateway: PaymentGatewayKey, mode?: PaymentMode | GatewayContext) {
  return typeof mode === "object" ? mode : getGatewayContext(gateway, mode);
}

async function callbackUrl(context: GatewayContext): Promise<string> {
  const configured = await getPaymentSetting(
    PAYMENT_GATEWAY_BY_KEY[context.gateway].callbackKey,
    context,
  );
  if (configured) return configured;
  return new URL(
    "/dashboard/settings/billing",
    apiEnv.AUTH_URL ?? "http://localhost:8080",
  ).toString();
}

export async function getStripeClient(mode?: PaymentMode | GatewayContext): Promise<Stripe | null> {
  const context = await contextFor("stripe", mode);
  const secretKey = await getPaymentSetting("stripe_secret_key", context);
  if (!secretKey) return null;
  if (!secretKey.startsWith(`sk_${context.mode}_`))
    throw new Error(`Use a Stripe ${context.mode} mode secret key.`);
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
}

export async function getDodoClient(
  options: { requireWebhookKey?: boolean; mode?: PaymentMode | GatewayContext } = {},
) {
  const context = await contextFor("dodo", options.mode);
  const [bearerToken, webhookKey] = await Promise.all([
    getPaymentSetting("dodo_api_key", context),
    getPaymentSetting("dodo_webhook_secret", context),
  ]);
  if (!bearerToken || (options.requireWebhookKey && !webhookKey)) return null;
  return new DodoPayments({
    bearerToken,
    webhookKey,
    environment: context.mode === "live" ? "live_mode" : "test_mode",
    maxRetries: 2,
    timeout: 15_000,
  });
}

export async function getRazorpayClient(
  mode?: PaymentMode | GatewayContext,
): Promise<Razorpay | null> {
  const context = await contextFor("razorpay", mode);
  const [keyId, keySecret] = await Promise.all([
    getPaymentSetting("razorpay_key_id", context),
    getPaymentSetting("razorpay_key_secret", context),
  ]);
  if (!keyId || !keySecret) return null;
  if (!keyId.startsWith(`rzp_${context.mode}_`))
    throw new Error(`Use a Razorpay ${context.mode} mode key ID.`);
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export async function gatewayReadiness(
  gateway: PaymentGatewayKey,
  mode?: PaymentMode | GatewayContext,
) {
  const context = await contextFor(gateway, mode);
  const definition = PAYMENT_GATEWAY_BY_KEY[gateway];
  const keys = [
    ...definition.credentialKeys,
    ...gatewayProductKeys(gateway),
    definition.callbackKey,
    ...(gateway === "dodo" ? ["dodo_brand_id"] : []),
  ];
  const values = await Promise.all(keys.map((key) => getPaymentSetting(key, context)));
  const configured = new Set(
    keys.filter(
      (key, index) =>
        Boolean(values[index]) && !validatePaymentSetting(key, values[index]!, context.mode),
    ),
  );
  const missingCredentials = definition.credentialKeys.filter((key) => !configured.has(key));
  const checkoutKeys = (["month", "year"] as const).map((interval) =>
    proCheckoutProductKey(gateway, interval),
  );
  const missingProducts = checkoutKeys.some((key) => configured.has(key)) ? [] : checkoutKeys;
  return {
    mode: context.mode,
    configuredKeys: [...configured],
    missingCredentials,
    missingProducts,
    ready: missingCredentials.length === 0 && missingProducts.length === 0,
  };
}

export async function configuredCheckoutProduct(
  gateway: PaymentGatewayKey,
  interval: BillingInterval,
  mode?: PaymentMode | GatewayContext,
) {
  const context = await contextFor(gateway, mode);
  return getPaymentSetting(proCheckoutProductKey(gateway, interval), context);
}

export async function gatewayBillingOptions(
  gateway: PaymentGatewayKey,
  mode?: PaymentMode | GatewayContext,
): Promise<ProBillingOption[]> {
  const context = await contextFor(gateway, mode);
  const options: ProBillingOption[] = [];
  for (const interval of ["month", "year"] as const) {
    const productId = await configuredCheckoutProduct(gateway, interval, context);
    if (!productId) continue;
    const option: ProBillingOption = { interval };
    const stored = await getPaymentSetting(`${gateway}_pro_offer_${interval}`, context);
    if (stored) {
      try {
        const offer = JSON.parse(stored);
        if (
          offer.productId === productId &&
          Number.isSafeInteger(offer.amountMinor) &&
          offer.amountMinor > 0 &&
          /^[A-Z]{3}$/.test(offer.currency)
        ) {
          option.amountMinor = offer.amountMinor;
          option.currency = offer.currency;
        }
      } catch {
        /* Manually configured IDs can omit a price preview. */
      }
    }
    options.push(option);
  }
  return options;
}

async function saveProOffer(
  gateway: PaymentGatewayKey,
  input: ProductInput,
  productId: string,
  context: GatewayContext,
) {
  await setPaymentSetting(
    `${gateway}_pro_offer_${input.interval}`,
    JSON.stringify({
      productId,
      amountMinor: input.amountMinor,
      currency: input.currency.toUpperCase(),
    }),
    context,
    {
      label: `${gateway} Pro ${input.interval} price preview`,
      category: "payment",
      isSecret: false,
    },
  );
}

export async function createProviderCheckout(
  gateway: PaymentGatewayKey,
  plan: Extract<Plan, "PRO">,
  actor: CheckoutActor,
  interval: BillingInterval,
  mode?: PaymentMode | GatewayContext,
): Promise<CheckoutResult> {
  const context = await contextFor(gateway, mode);
  const callback = await callbackUrl(context);

  if (gateway === "stripe") {
    const [stripe, priceId] = await Promise.all([
      getStripeClient(context),
      configuredCheckoutProduct(gateway, interval, context),
    ]);
    if (!stripe) throw new Error("Stripe secret key is not configured.");
    if (!priceId) throw new Error(`Stripe recurring Price for ${plan} is not configured.`);
    const successUrl = `${callbackWithState(callback, gateway, "success")}&session_id={CHECKOUT_SESSION_ID}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: actor.businessProfileId,
      customer_email: actor.email,
      success_url: successUrl,
      cancel_url: callbackWithState(callback, gateway, "cancelled"),
      metadata: {
        userId: actor.userId,
        businessProfileId: actor.businessProfileId,
        plan,
        billingMode: context.mode,
        billingInterval: interval,
      },
      subscription_data: {
        metadata: {
          userId: actor.userId,
          businessProfileId: actor.businessProfileId,
          plan,
          billingMode: context.mode,
          billingInterval: interval,
        },
      },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return {
      gateway,
      billingMode: context.mode,
      checkoutId: session.id,
      checkoutUrl: session.url,
      providerProductId: priceId,
      providerSubscriptionId:
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
      status: session.status ?? "open",
    };
  }

  if (gateway === "dodo") {
    const [dodo, productId] = await Promise.all([
      getDodoClient({ mode: context }),
      configuredCheckoutProduct(gateway, interval, context),
    ]);
    if (!dodo) throw new Error("Dodo Payments API key is not configured.");
    if (!productId) throw new Error(`Dodo subscription Product for ${plan} is not configured.`);
    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: actor.email, name: actor.name || actor.email },
      return_url: callbackWithState(callback, gateway, "complete"),
      cancel_url: callbackWithState(callback, gateway, "cancelled"),
      metadata: {
        userId: actor.userId,
        businessProfileId: actor.businessProfileId,
        plan,
        billingMode: context.mode,
        billingInterval: interval,
      },
      short_link: true,
    });
    if (!session.checkout_url) throw new Error("Dodo Payments did not return a checkout URL.");
    return {
      gateway,
      billingMode: context.mode,
      checkoutId: session.session_id,
      checkoutUrl: session.checkout_url,
      providerProductId: productId,
      status: "open",
    };
  }

  const [razorpay, planId] = await Promise.all([
    getRazorpayClient(context),
    configuredCheckoutProduct(gateway, interval, context),
  ]);
  if (!razorpay) throw new Error("Razorpay API keys are not configured.");
  if (!planId) throw new Error(`Razorpay Plan for ${plan} is not configured.`);
  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    quantity: 1,
    total_count: 12,
    notes: {
      userId: actor.userId,
      businessProfileId: actor.businessProfileId,
      plan,
      billingMode: context.mode,
      callbackUrl: callback,
      billingInterval: interval,
    },
  });
  if (!subscription.short_url) throw new Error("Razorpay did not return a checkout URL.");
  return {
    gateway,
    billingMode: context.mode,
    checkoutId: subscription.id,
    checkoutUrl: subscription.short_url,
    providerSubscriptionId: subscription.id,
    providerProductId: planId,
    status: subscription.status,
  };
}

export async function cancelProviderSubscription(subscription: {
  provider: string;
  providerSubscriptionId: string | null;
  razorpaySubscriptionId: string | null;
  billingMode?: string | null;
}) {
  const mode =
    subscription.billingMode === "test" || subscription.billingMode === "live"
      ? subscription.billingMode
      : await legacyGatewayMode(subscription.provider as PaymentGatewayKey);
  const externalId = subscription.providerSubscriptionId ?? subscription.razorpaySubscriptionId;
  if (!externalId) throw new Error("This subscription has no provider subscription ID.");

  if (subscription.provider === "stripe") {
    const stripe = await getStripeClient(mode);
    if (!stripe) throw new Error("Stripe secret key is not configured.");
    const updated = await stripe.subscriptions.update(externalId, { cancel_at_period_end: true });
    return { status: updated.status, cancelAtPeriodEnd: updated.cancel_at_period_end };
  }
  if (subscription.provider === "dodo") {
    const dodo = await getDodoClient({ mode });
    if (!dodo) throw new Error("Dodo Payments API key is not configured.");
    const updated = await dodo.subscriptions.update(externalId, {
      cancel_at_next_billing_date: true,
      cancel_reason: "cancelled_by_customer",
    });
    return { status: updated.status, cancelAtPeriodEnd: updated.cancel_at_next_billing_date };
  }
  if (subscription.provider === "razorpay") {
    const razorpay = await getRazorpayClient(mode);
    if (!razorpay) throw new Error("Razorpay API keys are not configured.");
    const updated = await razorpay.subscriptions.cancel(externalId, true);
    return { status: updated.status, cancelAtPeriodEnd: true };
  }
  throw new Error(`Provider ${subscription.provider} does not support gateway cancellation.`);
}

export async function createProviderProduct(
  gateway: PaymentGatewayKey,
  input: ProductInput,
  mode?: PaymentMode,
) {
  const context = await contextFor(gateway, mode);
  const suffix = `${input.plan.toLowerCase()}_${input.interval}`;
  const currency = input.currency.toUpperCase();

  if (gateway === "stripe") {
    const stripe = await getStripeClient(context);
    if (!stripe) throw new Error("Stripe secret key is not configured.");
    const product = await stripe.products.create({
      name: input.name,
      description: input.description,
      metadata: { actorconsolePlan: input.plan },
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: currency.toLowerCase(),
      unit_amount: input.amountMinor,
      recurring: { interval: input.interval },
      metadata: { actorconsolePlan: input.plan },
    });
    await Promise.all([
      setPaymentSetting(`stripe_product_id_${suffix}`, product.id, context, {
        label: `Stripe Product ID (${input.plan})`,
        category: "payment",
        isSecret: false,
      }),
      setPaymentSetting(`stripe_price_id_${suffix}`, price.id, context, {
        label: `Stripe Recurring Price ID (${input.plan})`,
        category: "payment",
        isSecret: false,
      }),
    ]);
    await saveProOffer(gateway, input, price.id, context);
    return { productId: product.id, priceId: price.id };
  }

  if (gateway === "dodo") {
    const dodo = await getDodoClient({ mode: context });
    if (!dodo) throw new Error("Dodo Payments API key is not configured.");
    const brandId = await getPaymentSetting("dodo_brand_id", context);
    const interval = input.interval === "year" ? "Year" : "Month";
    const product = await dodo.products.create({
      name: input.name,
      description: input.description,
      tax_category: "saas",
      metadata: { actorconsolePlan: input.plan },
      ...(brandId ? { brand_id: brandId } : {}),
      price: {
        type: "recurring_price",
        currency: currency as any,
        price: input.amountMinor,
        discount: 0,
        purchasing_power_parity: false,
        payment_frequency_count: 1,
        payment_frequency_interval: interval,
        subscription_period_count: 1,
        subscription_period_interval: interval,
      },
    });
    await setPaymentSetting(`dodo_product_id_${suffix}`, product.product_id, context, {
      label: `Dodo Subscription Product ID (${input.plan})`,
      category: "payment",
      isSecret: false,
    });
    await saveProOffer(gateway, input, product.product_id, context);
    return { productId: product.product_id };
  }

  const razorpay = await getRazorpayClient(context);
  if (!razorpay) throw new Error("Razorpay API keys are not configured.");
  const plan = await razorpay.plans.create({
    period: input.interval === "year" ? "yearly" : "monthly",
    interval: 1,
    item: {
      name: input.name,
      description: input.description,
      amount: input.amountMinor,
      currency,
    },
    notes: { actorconsolePlan: input.plan },
  });
  await setPaymentSetting(`razorpay_plan_id_${suffix}`, plan.id, context, {
    label: `Razorpay Plan ID (${input.plan})`,
    category: "payment",
    isSecret: false,
  });
  await saveProOffer(gateway, input, plan.id, context);
  return { productId: plan.item?.id ?? null, planId: plan.id };
}

/** Connect a dashboard-created product using provider-authoritative billing details. */
export async function importProviderProduct(
  gateway: PaymentGatewayKey,
  productId: string,
  interval: BillingInterval,
  mode?: PaymentMode,
) {
  if (gateway === "dodo") return importDodoProduct(productId, interval, mode);
  const context = await contextFor(gateway, mode);
  const key = proCheckoutProductKey(gateway, interval);
  const formatError = validatePaymentSetting(key, productId, context.mode);
  if (formatError) throw new Error(formatError);
  let amountMinor: number | null;
  let currency: string;
  if (gateway === "stripe") {
    const stripe = await getStripeClient(context);
    if (!stripe) throw new Error("Stripe secret key is not configured.");
    const price = await stripe.prices.retrieve(productId);
    if (
      !price.active ||
      price.type !== "recurring" ||
      price.recurring?.interval !== interval ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== "licensed"
    ) {
      throw new Error(`Choose an active fixed-price subscription billed once per ${interval}.`);
    }
    amountMinor = price.unit_amount;
    currency = price.currency.toUpperCase();
  } else {
    const razorpay = await getRazorpayClient(context);
    if (!razorpay) throw new Error("Razorpay API keys are not configured.");
    const plan = await razorpay.plans.fetch(productId);
    if (plan.period !== (interval === "year" ? "yearly" : "monthly") || plan.interval !== 1) {
      throw new Error(`Choose a subscription plan billed once per ${interval}.`);
    }
    amountMinor = Number(plan.item.amount);
    currency = plan.item.currency.toUpperCase();
  }
  if (
    amountMinor === null ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    throw new Error("The subscription plan must have a positive fixed recurring price.");
  }
  await setPaymentSetting(key, productId, context, {
    label: `${gateway} Pro ${interval} checkout ID`,
    category: "payment",
    isSecret: false,
  });
  await saveProOffer(
    gateway,
    { plan: "PRO", name: "Actor Console Pro", amountMinor, currency, interval },
    productId,
    context,
  );
  return { productId, amountMinor, currency, interval };
}

export async function importDodoProduct(
  productId: string,
  interval: BillingInterval,
  mode?: PaymentMode,
) {
  const context = await contextFor("dodo", mode);
  const formatError = validatePaymentSetting(
    proCheckoutProductKey("dodo", interval),
    productId,
    context.mode,
  );
  if (formatError) throw new Error(formatError);
  const dodo = await getDodoClient({ mode: context });
  if (!dodo) throw new Error("Dodo Payments API key is not configured.");
  const product = await dodo.products.retrieve(productId);
  const price = product.price;
  const expectedInterval = interval === "year" ? "Year" : "Month";
  if (
    !product.is_recurring ||
    price.type !== "recurring_price" ||
    price.payment_frequency_count !== 1 ||
    price.payment_frequency_interval !== expectedInterval
  ) {
    throw new Error(`Choose a recurring product billed once per ${interval}.`);
  }
  const brandId = await getPaymentSetting("dodo_brand_id", context);
  if (brandId && product.brand_id !== brandId) {
    throw new Error("This product does not belong to the configured Actor Console brand.");
  }
  const discountBps = price.discount_bps ?? (price.discount ?? 0) * 100;
  const amountMinor = Math.round(price.price * (1 - discountBps / 10_000));
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    !/^[A-Z]{3}$/.test(price.currency)
  ) {
    throw new Error("The subscription product must have a positive recurring price.");
  }
  await setPaymentSetting(proCheckoutProductKey("dodo", interval), product.product_id, context, {
    label: `Dodo Subscription Product ID (Pro) — ${interval === "year" ? "Yearly" : "Monthly"}`,
    category: "payment",
    isSecret: false,
  });
  await saveProOffer(
    "dodo",
    {
      plan: "PRO",
      name: product.name ?? "Actor Console Pro",
      amountMinor,
      currency: price.currency,
      interval,
    },
    product.product_id,
    context,
  );
  return {
    productId: product.product_id,
    name: product.name,
    amountMinor,
    currency: price.currency,
    interval,
  };
}

export async function testGatewayConnection(
  gateway: PaymentGatewayKey,
  mode?: PaymentMode,
): Promise<string> {
  const context = await contextFor(gateway, mode);
  if (gateway === "stripe") {
    const stripe = await getStripeClient(context);
    if (!stripe) throw new Error("Stripe secret key is not configured.");
    const balance = await stripe.balance.retrieve();
    return `Stripe authenticated (${balance.available.length} available balance currency entries).`;
  }
  if (gateway === "dodo") {
    const dodo = await getDodoClient({ mode: context });
    if (!dodo) throw new Error("Dodo Payments API key is not configured.");
    const page = await dodo.products.list({ page_size: 1 });
    const options = await gatewayBillingOptions("dodo", context);
    for (const option of options) {
      const productId = await configuredCheckoutProduct("dodo", option.interval, context);
      if (!productId) continue;
      try {
        // Validate merchant eligibility without creating customers, checkout
        // sessions, subscriptions, or payments.
        await dodo.checkoutSessions.preview({
          product_cart: [{ product_id: productId, quantity: 1 }],
        });
      } catch (error) {
        if (context.mode === "live" && isDodoLivePaymentsUnavailable(error)) {
          throw new Error(
            "Dodo Payments authenticated, but live checkout is not activated for this merchant. Complete live activation for the business associated with this API key in the Dodo dashboard, then test again.",
          );
        }
        throw error;
      }
    }
    if (options.length)
      return `Dodo Payments authenticated; ${context.mode} checkout preview passed for ${options.map((option) => (option.interval === "year" ? "yearly" : "monthly")).join(" and ")} Pro.`;
    return `Dodo Payments authenticated (${page.items.length} product returned).`;
  }
  const razorpay = await getRazorpayClient(context);
  if (!razorpay) throw new Error("Razorpay API keys are not configured.");
  const payments = await razorpay.payments.all({ count: 1 });
  return `Razorpay authenticated (${payments.items.length} recent payment returned).`;
}
