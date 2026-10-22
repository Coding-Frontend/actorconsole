import { db, type Prisma } from "@actorconsole/db";
import {
  INTEGRATION_CATALOG,
  paymentModeSettingKey,
  type PaymentGatewayKey,
  type PaymentMode,
} from "@actorconsole/shared";
import { getIntegration, setIntegration } from "./integrations.js";

export interface GatewayContext {
  gateway: PaymentGatewayKey;
  mode: PaymentMode;
  legacyFallback: boolean;
}

export function isPaymentMode(value: unknown): value is PaymentMode {
  return value === "test" || value === "live";
}

export async function legacyGatewayMode(gateway: PaymentGatewayKey): Promise<PaymentMode> {
  const key = await getIntegration(
    gateway === "stripe"
      ? "stripe_secret_key"
      : gateway === "razorpay"
        ? "razorpay_key_id"
        : "dodo_environment",
  );
  return gateway === "dodo"
    ? key === "live_mode"
      ? "live"
      : "test"
    : key?.includes("_live_")
      ? "live"
      : "test";
}

export async function getGatewayContext(
  gateway: PaymentGatewayKey,
  mode?: PaymentMode,
): Promise<GatewayContext> {
  const row = await db.paymentGateway.findUnique({ where: { key: gateway } });
  const config = (row?.config ?? {}) as Record<string, unknown>;
  const legacyMode = await legacyGatewayMode(gateway);
  const selected = mode ?? (isPaymentMode(config.mode) ? config.mode : legacyMode);
  return {
    gateway,
    mode: selected,
    legacyFallback:
      selected === legacyMode &&
      !(Array.isArray(config.managedModes) && config.managedModes.includes(selected)),
  };
}

/** Never fall back to credentials or products belonging to the other mode. */
export async function getPaymentSetting(
  key: string,
  context: GatewayContext,
): Promise<string | null> {
  const scoped = await getIntegration(paymentModeSettingKey(key, context.mode));
  // Empty environment-variable placeholders are unconfigured, just like absent keys.
  return scoped || (context.legacyFallback ? await getIntegration(key) : null) || null;
}

export async function setPaymentSetting(
  key: string,
  value: string,
  context: GatewayContext,
  metadata: { label: string; category: string; isSecret: boolean },
) {
  return setIntegration(paymentModeSettingKey(key, context.mode), value, metadata);
}

export function gatewayFields(gateway: PaymentGatewayKey) {
  return INTEGRATION_CATALOG.filter(
    (field) =>
      field.category === "payment" &&
      field.key.startsWith(`${gateway}_`) &&
      field.key !== "dodo_environment",
  );
}

export function validatePaymentSetting(
  key: string,
  value: string,
  mode: PaymentMode,
): string | null {
  const field = INTEGRATION_CATALOG.find((entry) => entry.key === key);
  if (!field) return "Unknown payment setting.";
  if (!value) return null;
  if (field.pattern && !new RegExp(field.pattern).test(value))
    return `${field.label} has an invalid format.`;
  if (
    (key === "stripe_secret_key" || key === "stripe_publishable_key") &&
    !value.startsWith(`${key === "stripe_secret_key" ? "sk" : "pk"}_${mode}_`)
  ) {
    return `Use a Stripe ${mode} mode key.`;
  }
  if (key === "razorpay_key_id" && !value.startsWith(`rzp_${mode}_`))
    return `Use a Razorpay ${mode} mode key.`;
  return null;
}

/** Copy legacy settings before managing either profile, preserving the original environment. */
export async function saveGatewaySettings(
  gateway: PaymentGatewayKey,
  mode: PaymentMode,
  settings: Record<string, string | null>,
) {
  const fields = gatewayFields(gateway);
  for (const [key, value] of Object.entries(settings)) {
    if (!fields.some((field) => field.key === key)) throw new Error("Unknown payment setting.");
    const error = validatePaymentSetting(key, value ?? "", mode);
    if (error) throw new Error(error);
  }
  const row = await db.paymentGateway.findUnique({ where: { key: gateway } });
  if (!row) throw new Error("Payment gateway not found.");
  const config = (row.config ?? {}) as Record<string, unknown>;
  const managed = new Set(
    Array.isArray(config.managedModes) ? config.managedModes.filter(isPaymentMode) : [],
  );
  const legacyMode = await legacyGatewayMode(gateway);
  if (!managed.has(legacyMode)) {
    const keys = [
      ...fields.map((field) => field.key),
      `${gateway}_pro_offer_month`,
      `${gateway}_pro_offer_year`,
    ];
    for (const key of keys) {
      const scoped = paymentModeSettingKey(key, legacyMode);
      if (await getIntegration(scoped)) continue;
      const value = await getIntegration(key);
      if (value) {
        const field = fields.find((entry) => entry.key === key);
        await setIntegration(scoped, value, {
          label: field?.label ?? key,
          category: "payment",
          isSecret: field?.isSecret ?? false,
        });
      }
    }
    managed.add(legacyMode);
    // Preserve the origin of subscriptions created before mode tracking existed.
    await db.subscription.updateMany({
      where: { provider: gateway, billingMode: null },
      data: { billingMode: legacyMode },
    });
    await db.payment.updateMany({
      where: { provider: gateway, billingMode: null },
      data: { billingMode: legacyMode },
    });
  }
  for (const [key, value] of Object.entries(settings)) {
    const field = fields.find((entry) => entry.key === key)!;
    const scoped = paymentModeSettingKey(key, mode);
    // Blank secret inputs preserve the saved secret; null explicitly clears it.
    if (value === "" && field.isSecret) continue;
    // An encrypted empty override also clears environment-provided settings.
    // Deleting the row would silently restore the environment variable.
    await setIntegration(scoped, value ?? "", {
      label: field.label,
      category: "payment",
      isSecret: field.isSecret,
    });
  }
  managed.add(mode);
  await db.paymentGateway.update({
    where: { key: gateway },
    data: {
      config: {
        ...config,
        mode: isPaymentMode(config.mode) ? config.mode : legacyMode,
        managedModes: [...managed],
      } as Prisma.InputJsonValue,
    },
  });
}

export async function paymentProfileFields(context: GatewayContext) {
  return Promise.all(
    gatewayFields(context.gateway).map(async (field) => {
      const value = await getPaymentSetting(field.key, context);
      return {
        key: field.key,
        label: field.label,
        description: field.description,
        isSecret: field.isSecret,
        configured: Boolean(value),
        ...(field.isSecret ? {} : { value: value ?? "" }),
      };
    }),
  );
}

export async function paymentWebhookContext(gateway: PaymentGatewayKey, requestedMode?: string) {
  if (requestedMode !== undefined && !isPaymentMode(requestedMode))
    throw new Error("Invalid payment mode.");
  // Existing webhook URLs remain pinned to their original environment.
  return getGatewayContext(gateway, requestedMode ?? (await legacyGatewayMode(gateway)));
}

export async function subscriptionMatchesMode(
  subscription: { billingMode?: string | null } | null,
  context: GatewayContext,
): Promise<boolean> {
  return (
    !subscription ||
    (subscription.billingMode ?? (await legacyGatewayMode(context.gateway))) === context.mode
  );
}
