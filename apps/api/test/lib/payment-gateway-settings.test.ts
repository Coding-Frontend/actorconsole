import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  subscriptionBackfill: vi.fn(),
  paymentBackfill: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    paymentGateway: { findUnique: mocks.find, update: mocks.update },
    subscription: { updateMany: mocks.subscriptionBackfill },
    payment: { updateMany: mocks.paymentBackfill },
  },
}));
vi.mock("../../src/lib/integrations.js", () => ({
  getIntegration: mocks.get,
  setIntegration: mocks.set,
  deleteIntegration: mocks.remove,
}));

import {
  getGatewayContext,
  getPaymentSetting,
  paymentProfileFields,
  paymentWebhookContext,
  saveGatewaySettings,
  subscriptionMatchesMode,
  validatePaymentSetting,
} from "../../src/lib/payment-gateway-settings.js";
import {
  getDodoClient,
  getStripeClient,
  getRazorpayClient,
  createProviderCheckout,
  createProviderProduct,
  cancelProviderSubscription,
} from "../../src/lib/billing-providers.js";

const providers = vi.hoisted(() => ({
  stripe: vi.fn(),
  dodo: vi.fn(),
  razorpay: vi.fn(),
  checkout: vi.fn(),
  cancel: vi.fn(),
  product: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    constructor(...args: unknown[]) {
      providers.stripe(...args);
    }
    checkout = { sessions: { create: providers.checkout } };
    subscriptions = { update: providers.cancel };
  },
}));
vi.mock("dodopayments", () => ({
  default: class {
    constructor(...args: unknown[]) {
      providers.dodo(...args);
    }
    checkoutSessions = { create: providers.checkout };
    subscriptions = { update: providers.cancel };
    products = { create: providers.product };
  },
}));
vi.mock("razorpay", () => ({
  default: class {
    constructor(...args: unknown[]) {
      providers.razorpay(...args);
    }
    subscriptions = { create: providers.checkout, cancel: providers.cancel };
  },
}));

describe("Payment mode isolation", () => {
  let settings: Record<string, string>;
  let row: { key: string; config: Record<string, unknown> };
  beforeEach(() => {
    vi.clearAllMocks();
    settings = {};
    row = { key: "stripe", config: {} };
    mocks.find.mockImplementation(async () => row);
    mocks.get.mockImplementation(async (key: string) => settings[key] ?? null);
    mocks.set.mockImplementation(async (key: string, value: string) => {
      settings[key] = value;
    });
    mocks.remove.mockImplementation(async (key: string) => {
      delete settings[key];
    });
    mocks.update.mockImplementation(async ({ data }) => {
      row.config = data.config;
      return row;
    });
    providers.checkout.mockResolvedValue({
      id: "cs_live",
      url: "https://checkout.test",
      session_id: "session_live",
      checkout_url: "https://checkout.test",
    });
    providers.cancel.mockResolvedValue({ status: "active", cancel_at_period_end: true });
    providers.product.mockResolvedValue({ product_id: "pdt_live" });
  });

  it.each([
    ["stripe", "stripe_secret_key", "sk_live_existing"],
    ["razorpay", "razorpay_key_id", "rzp_live_existing"],
    ["dodo", "dodo_environment", "live_mode"],
  ] as const)(
    "infers the original %s environment without sharing it with test",
    async (gateway, key, value) => {
      settings[key] = value;
      const live = await getGatewayContext(gateway);
      expect(live).toMatchObject({ mode: "live", legacyFallback: true });
      const test = await getGatewayContext(gateway, "test");
      expect(test.legacyFallback).toBe(false);
      expect(await getPaymentSetting(key, test)).toBeNull();
    },
  );

  it("preserves existing live settings and subscription origins when saving test credentials", async () => {
    settings.stripe_secret_key = "sk_live_existing";
    settings.stripe_price_id_pro_year = "price_live_year";
    await saveGatewaySettings("stripe", "test", { stripe_secret_key: "sk_test_newkey" });
    expect(settings.stripe_live_secret_key).toBe("sk_live_existing");
    expect(settings.stripe_live_price_id_pro_year).toBe("price_live_year");
    expect(settings.stripe_test_secret_key).toBe("sk_test_newkey");
    expect(row.config).toMatchObject({ mode: "live", managedModes: ["live", "test"] });
    expect(mocks.subscriptionBackfill).toHaveBeenCalledWith({
      where: { provider: "stripe", billingMode: null },
      data: { billingMode: "live" },
    });
    expect(mocks.paymentBackfill).toHaveBeenCalledWith({
      where: { provider: "stripe", billingMode: null },
      data: { billingMode: "live" },
    });
  });

  it("blank secrets are preserved and explicitly cleared secrets never fall back to legacy values", async () => {
    settings.stripe_secret_key = "sk_test_existing";
    await saveGatewaySettings("stripe", "test", { stripe_secret_key: "" });
    expect(await getPaymentSetting("stripe_secret_key", await getGatewayContext("stripe"))).toBe(
      "sk_test_existing",
    );
    await saveGatewaySettings("stripe", "test", { stripe_secret_key: null });
    expect(
      await getPaymentSetting("stripe_secret_key", await getGatewayContext("stripe")),
    ).toBeNull();
    expect(settings.stripe_secret_key).toBe("sk_test_existing");
    expect(mocks.subscriptionBackfill).toHaveBeenCalledOnce();
  });

  it("ignores empty scoped environment placeholders when preserving legacy configuration", async () => {
    settings.stripe_secret_key = "sk_live_existing";
    settings.stripe_live_secret_key = "";
    expect(await getPaymentSetting("stripe_secret_key", await getGatewayContext("stripe"))).toBe(
      "sk_live_existing",
    );
    expect(
      await getPaymentSetting("stripe_secret_key", await getGatewayContext("stripe", "test")),
    ).toBeNull();
  });

  it("clears an environment-provided secret with an empty stored override", async () => {
    row.config = { mode: "test", managedModes: ["test"] };
    mocks.get.mockImplementation(
      async (key: string) =>
        settings[key] ?? (key === "stripe_test_secret_key" ? "sk_test_environment" : null),
    );
    await saveGatewaySettings("stripe", "test", { stripe_secret_key: null });
    expect(settings.stripe_test_secret_key).toBe("");
    expect(
      await getPaymentSetting("stripe_secret_key", await getGatewayContext("stripe")),
    ).toBeNull();
  });

  it("returns configured metadata for secrets without returning their values", async () => {
    settings.stripe_test_secret_key = "sk_test_private";
    settings.stripe_test_price_id_pro_year = "price_public";
    const fields = await paymentProfileFields(await getGatewayContext("stripe", "test"));
    expect(fields.find((field) => field.key === "stripe_secret_key")).toMatchObject({
      configured: true,
      isSecret: true,
    });
    expect(JSON.stringify(fields)).not.toContain("sk_test_private");
    expect(fields.find((field) => field.key === "stripe_price_id_pro_year")?.value).toBe(
      "price_public",
    );
  });

  it("rejects wrong-mode keys and cross-provider setting writes before modifying storage", async () => {
    await expect(
      saveGatewaySettings("stripe", "live", { stripe_secret_key: "sk_test_existing" }),
    ).rejects.toThrow("live mode");
    await expect(
      saveGatewaySettings("stripe", "test", { dodo_api_key: "private" }),
    ).rejects.toThrow("Unknown");
    expect(validatePaymentSetting("razorpay_key_id", "rzp_test_123456", "live")).toContain(
      "live mode",
    );
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("keeps legacy webhook URLs in the original environment after checkout switches", async () => {
    settings.stripe_secret_key = "sk_test_old";
    row.config = { mode: "live", managedModes: ["test", "live"] };
    expect((await paymentWebhookContext("stripe")).mode).toBe("test");
    expect((await paymentWebhookContext("stripe", "live")).mode).toBe("live");
    await expect(paymentWebhookContext("stripe", "invalid")).rejects.toThrow();
    expect(
      await subscriptionMatchesMode(
        { billingMode: "live" },
        await getGatewayContext("stripe", "test"),
      ),
    ).toBe(false);
  });

  it("uses the active profile's keys, product, callback, and metadata for checkout", async () => {
    row.config = { mode: "live", managedModes: ["test", "live"] };
    Object.assign(settings, {
      stripe_test_secret_key: "sk_test_private",
      stripe_test_price_id_pro_year: "price_test",
      stripe_live_secret_key: "sk_live_private",
      stripe_live_price_id_pro_year: "price_live",
      stripe_live_callback_url: "https://app.test/billing",
    });
    const result = await createProviderCheckout(
      "stripe",
      "PRO",
      { userId: "u", businessProfileId: "bp", email: "payer@test.com" },
      "year",
    );
    expect(result.billingMode).toBe("live");
    expect(providers.stripe).toHaveBeenCalledWith("sk_live_private", expect.any(Object));
    expect(providers.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_live", quantity: 1 }],
        success_url: expect.stringContaining("https://app.test/billing"),
        metadata: expect.objectContaining({ billingMode: "live" }),
      }),
    );
  });

  it("never uses test credentials to construct a live client", async () => {
    settings.stripe_live_secret_key = "sk_test_wrong";
    settings.razorpay_live_key_id = "rzp_test_wrong";
    settings.razorpay_live_key_secret = "secret";
    await expect(getStripeClient("live")).rejects.toThrow("live mode");
    await expect(getRazorpayClient("live")).rejects.toThrow("live mode");
    expect(providers.stripe).not.toHaveBeenCalled();
    expect(providers.razorpay).not.toHaveBeenCalled();
  });

  it("constructs Dodo with the selected environment and matching keys", async () => {
    settings.dodo_test_api_key = "test_private";
    settings.dodo_live_api_key = "live_private";
    settings.dodo_live_webhook_secret = "live_webhook";
    await getDodoClient({ mode: "live", requireWebhookKey: true });
    expect(providers.dodo).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "live_mode",
        bearerToken: "live_private",
        webhookKey: "live_webhook",
      }),
    );
  });

  it("creates products in an inactive profile without switching checkout", async () => {
    row.config = { mode: "test" };
    settings.dodo_live_api_key = "live_private";
    await createProviderProduct(
      "dodo",
      { plan: "PRO", name: "Pro", amountMinor: 1900, currency: "USD", interval: "year" },
      "live",
    );
    expect(settings.dodo_live_product_id_pro_year).toBe("pdt_live");
    expect(settings.dodo_test_product_id_pro_year).toBeUndefined();
    expect(row.config.mode).toBe("test");
  });

  it("cancels an existing test subscription using test credentials after switching checkout to live", async () => {
    row.config = { mode: "live", managedModes: ["test", "live"] };
    settings.stripe_test_secret_key = "sk_test_private";
    settings.stripe_live_secret_key = "sk_live_private";
    await cancelProviderSubscription({
      provider: "stripe",
      billingMode: "test",
      providerSubscriptionId: "sub_test",
      razorpaySubscriptionId: null,
    });
    expect(providers.stripe).toHaveBeenCalledWith("sk_test_private", expect.any(Object));
    expect(providers.cancel).toHaveBeenCalledWith("sub_test", { cancel_at_period_end: true });
  });
});
