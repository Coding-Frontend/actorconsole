import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindMany,
  mockGetIntegration,
  mockCheckoutCreate,
  mockSubscriptionUpdate,
  mockSetIntegration,
  mockProductCreate,
  mockPriceCreate,
  mockProductRetrieve,
  mockProductList,
  mockCheckoutPreview,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockGetIntegration: vi.fn(),
  mockCheckoutCreate: vi.fn(),
  mockSubscriptionUpdate: vi.fn(),
  mockSetIntegration: vi.fn(),
  mockProductCreate: vi.fn(),
  mockPriceCreate: vi.fn(),
  mockProductRetrieve: vi.fn(),
  mockProductList: vi.fn(),
  mockCheckoutPreview: vi.fn(),
}));

vi.mock("dodopayments", () => ({
  default: class {
    products = { create: mockProductCreate, retrieve: mockProductRetrieve, list: mockProductList };
    checkoutSessions = { create: mockCheckoutCreate, preview: mockCheckoutPreview };
    subscriptions = {
      update: mockSubscriptionUpdate,
      mockSetIntegration,
      mockProductCreate,
      mockPriceCreate,
    };
  },
}));

vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: mockCheckoutCreate } };
    products = { create: mockProductCreate };
    prices = { create: mockPriceCreate, retrieve: mockProductRetrieve };
  },
}));
vi.mock("razorpay", () => ({
  default: class {
    subscriptions = { create: mockCheckoutCreate };
    plans = { create: mockProductCreate, fetch: mockProductRetrieve };
  },
}));

vi.mock("../../src/lib/integrations.js", () => ({
  getIntegration: (...args: unknown[]) => mockGetIntegration(...args),
  setIntegration: (...args: unknown[]) => mockSetIntegration(...args),
}));

vi.mock("@actorconsole/db", () => ({
  db: {
    paymentGateway: { findUnique: vi.fn().mockResolvedValue(null) },
    integration: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

import {
  cancelProviderSubscription,
  createProviderCheckout,
  gatewayReadiness,
  gatewayBillingOptions,
  createProviderProduct,
  importDodoProduct,
  importProviderProduct,
  testGatewayConnection,
} from "../../src/lib/billing-providers.js";

describe("Dodo gateway readiness", () => {
  afterEach(() => {
    delete process.env.DODO_API_KEY;
    delete process.env.DODO_WEBHOOK_SECRET;
    delete process.env.DODO_PRODUCT_ID_PRO_MONTH;
    vi.clearAllMocks();
  });

  it("recognizes the documented environment variable configuration", async () => {
    mockFindMany.mockResolvedValue([]);
    mockGetIntegration.mockImplementation(
      async (key: string) => process.env[key.toUpperCase()] ?? null,
    );
    process.env.DODO_API_KEY = "test_key_12345678901234567890";
    process.env.DODO_WEBHOOK_SECRET = "test_secret";
    process.env.DODO_PRODUCT_ID_PRO_MONTH = "prod_test";

    expect(await gatewayReadiness("dodo")).toEqual(
      expect.objectContaining({ ready: true, missingCredentials: [], missingProducts: [] }),
    );
  });

  it("creates a Dodo recurring checkout with workspace metadata and the billing return URL", async () => {
    mockGetIntegration.mockImplementation(
      async (key: string) =>
        ({
          dodo_api_key: "test_key_12345678901234567890",
          dodo_environment: "test_mode",
          dodo_webhook_secret: "test_secret",
          dodo_product_id_pro_month: "prod_pro",
        })[key as "dodo_api_key"],
    );
    mockCheckoutCreate.mockResolvedValue({
      session_id: "checkout_1",
      checkout_url: "https://checkout.dodopayments.com/checkout_1",
    });

    const result = await createProviderCheckout(
      "dodo",
      "PRO",
      {
        userId: "user_1",
        businessProfileId: "workspace_1",
        email: "payer@example.com",
      },
      "month",
    );

    expect(result.checkoutId).toBe("checkout_1");
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        product_cart: [{ product_id: "prod_pro", quantity: 1 }],
        metadata: {
          userId: "user_1",
          businessProfileId: "workspace_1",
          plan: "PRO",
          billingMode: "test",
          billingInterval: "month",
        },
        return_url: expect.stringContaining(
          "/dashboard/settings/billing?checkout=complete&gateway=dodo",
        ),
      }),
    );
  });

  it("schedules a Dodo subscription cancellation at the next billing date", async () => {
    mockGetIntegration.mockImplementation(async (key: string) =>
      key === "dodo_api_key" ? "test_key_12345678901234567890" : null,
    );
    mockSubscriptionUpdate.mockResolvedValue({
      status: "active",
      cancel_at_next_billing_date: true,
    });

    expect(
      await cancelProviderSubscription({
        provider: "dodo",
        providerSubscriptionId: "dodo_sub_1",
        razorpaySubscriptionId: null,
      }),
    ).toEqual({ status: "active", cancelAtPeriodEnd: true });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith("dodo_sub_1", {
      cancel_at_next_billing_date: true,
      cancel_reason: "cancelled_by_customer",
    });
  });
});

describe("Pro billing intervals", () => {
  let settings: Record<string, string>;
  const actor = { userId: "u1", businessProfileId: "bp1", email: "payer@example.com" };
  beforeEach(() => {
    vi.clearAllMocks();
    settings = {
      stripe_secret_key: "sk_test_1234567890",
      dodo_api_key: "test_key_12345678901234567890",
      razorpay_key_id: "rzp_test_123456789",
      razorpay_key_secret: "secret12345678901234567890",
    };
    mockGetIntegration.mockImplementation(async (key: string) => settings[key] ?? null);
    mockSetIntegration.mockImplementation(async (key: string, value: string) => {
      settings[key] = value;
    });
    mockCheckoutCreate.mockResolvedValue({
      id: "checkout",
      url: "https://checkout.test",
      session_id: "checkout",
      checkout_url: "https://checkout.test",
      short_url: "https://checkout.test",
      status: "open",
    });
    mockProductCreate.mockResolvedValue({ id: "product_or_plan", product_id: "dodo_product" });
    mockPriceCreate.mockResolvedValue({ id: "stripe_price" });
    mockProductList.mockResolvedValue({ items: [{}] });
    mockCheckoutPreview.mockResolvedValue({});
  });

  it("checks both Dodo billing options without creating any checkout or payment", async () => {
    settings.dodo_environment = "live_mode";
    settings.dodo_product_id_pro_month = "pdt_month";
    settings.dodo_product_id_pro_year = "pdt_year";
    expect(await testGatewayConnection("dodo", "live")).toContain(
      "live checkout preview passed for monthly and yearly Pro",
    );
    expect(mockCheckoutPreview.mock.calls).toEqual([
      [{ product_cart: [{ product_id: "pdt_month", quantity: 1 }] }],
      [{ product_cart: [{ product_id: "pdt_year", quantity: 1 }] }],
    ]);
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
    expect(mockSetIntegration).not.toHaveBeenCalled();
  });

  it("reports missing Dodo merchant activation even when live product reads work", async () => {
    settings.dodo_environment = "live_mode";
    settings.dodo_product_id_pro_year = "pdt_year";
    mockCheckoutPreview.mockRejectedValueOnce(
      Object.assign(new Error("403 Live payments not enabled for merchant"), { status: 403 }),
    );
    await expect(testGatewayConnection("dodo", "live")).rejects.toThrow(
      "Complete live activation for the business associated with this API key",
    );
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["stripe", "stripe_price_id_pro_year", "price_year"],
    ["dodo", "dodo_product_id_pro_year", "prod_year"],
    ["razorpay", "razorpay_plan_id_pro_year", "plan_year"],
  ] as const)("uses the selected yearly %s product", async (gateway, key, id) => {
    settings[key] = id;
    const result = await createProviderCheckout(gateway, "PRO", actor, "year");
    expect(result.providerProductId).toBe(id);
    const payload = mockCheckoutCreate.mock.calls[0][0];
    const used =
      payload.line_items?.[0].price ?? payload.product_cart?.[0].product_id ?? payload.plan_id;
    expect(used).toBe(id);
  });

  it.each(["stripe", "dodo", "razorpay"] as const)(
    "ignores the generic Pro ID for %s readiness and billing choices",
    async (gateway) => {
      const key =
        gateway === "stripe"
          ? "stripe_price_id_pro"
          : gateway === "dodo"
            ? "dodo_product_id_pro"
            : "razorpay_plan_id_pro";
      settings[key] = "legacy_product";
      settings[`${gateway}_webhook_secret`] = "webhook_secret";
      if (gateway === "stripe") settings.stripe_publishable_key = "pk_test_123";
      expect(await gatewayReadiness(gateway)).toMatchObject({ ready: false });
      expect(await gatewayBillingOptions(gateway)).toEqual([]);
    },
  );

  it.each([
    [
      "stripe",
      "price_year",
      {
        active: true,
        type: "recurring",
        recurring: { interval: "year", interval_count: 1, usage_type: "licensed" },
        unit_amount: 19900,
        currency: "usd",
      },
    ],
    [
      "razorpay",
      "plan_year",
      { period: "yearly", interval: 1, item: { amount: 19900, currency: "USD" } },
    ],
  ] as const)(
    "verifies an existing yearly %s plan and saves its authoritative price",
    async (gateway, id, product) => {
      mockProductRetrieve.mockResolvedValue(product);
      const result = await importProviderProduct(gateway, id, "year");
      expect(result).toMatchObject({
        productId: id,
        amountMinor: 19900,
        currency: "USD",
        interval: "year",
      });
      expect(await gatewayBillingOptions(gateway)).toEqual([
        { interval: "year", amountMinor: 19900, currency: "USD" },
      ]);
      expect(mockProductCreate).not.toHaveBeenCalled();
      expect(mockPriceCreate).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "stripe",
      "price_month",
      {
        active: true,
        type: "recurring",
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
        unit_amount: 1900,
        currency: "usd",
      },
    ],
    [
      "razorpay",
      "plan_month",
      { period: "monthly", interval: 1, item: { amount: 1900, currency: "USD" } },
    ],
  ] as const)(
    "rejects a monthly %s plan in the yearly slot without changing settings",
    async (gateway, id, product) => {
      mockProductRetrieve.mockResolvedValue(product);
      await expect(importProviderProduct(gateway, id, "year")).rejects.toThrow("once per year");
      expect(mockSetIntegration).not.toHaveBeenCalled();
    },
  );

  it.each(["stripe", "dodo", "razorpay"] as const)(
    "does not replace monthly %s settings when creating yearly",
    async (gateway) => {
      const base =
        gateway === "stripe"
          ? "stripe_price_id_pro"
          : gateway === "dodo"
            ? "dodo_product_id_pro"
            : "razorpay_plan_id_pro";
      settings[base] = "legacy_product";
      settings[`${base}_month`] = "monthly_product";
      await createProviderProduct(gateway, {
        plan: "PRO",
        name: "Pro",
        amountMinor: 19000,
        currency: "USD",
        interval: "year",
      });
      expect(settings[base]).toBe("legacy_product");
      expect(settings[`${base}_month`]).toBe("monthly_product");
      expect(settings[`${gateway}_test_${base.slice(gateway.length + 1)}_year`]).toBeTruthy();
      expect(await gatewayBillingOptions(gateway)).toEqual([
        { interval: "month" },
        { interval: "year", amountMinor: 19000, currency: "USD" },
      ]);
    },
  );

  it("keeps unknown legacy billing cycles unlabeled rather than assuming monthly", async () => {
    settings.dodo_product_id_pro = "legacy";
    expect(await gatewayBillingOptions("dodo")).toEqual([]);
    await expect(createProviderCheckout("dodo", "PRO", actor, "year")).rejects.toThrow(
      "not configured",
    );
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it("does not show stale price previews after changing a product ID manually", async () => {
    settings.dodo_product_id_pro_year = "new_product";
    settings.dodo_pro_offer_year = JSON.stringify({
      productId: "old_product",
      amountMinor: 10,
      currency: "USD",
    });
    expect(await gatewayBillingOptions("dodo")).toEqual([{ interval: "year" }]);
  });

  it("creates Dodo products under the configured Actor Console brand", async () => {
    settings.dodo_brand_id = "brnd_actor_console";
    await createProviderProduct("dodo", {
      plan: "PRO",
      name: "Actor Console Pro",
      amountMinor: 1900,
      currency: "USD",
      interval: "month",
    });
    expect(mockProductCreate).toHaveBeenCalledWith(
      expect.objectContaining({ brand_id: "brnd_actor_console" }),
    );
  });

  it.each([
    { discount: { discount: 10 }, amountMinor: 1710 },
    { discount: {}, amountMinor: 1900 },
    { discount: { discount_bps: 1250, discount: 13 }, amountMinor: 1663 },
    { discount: { discount_bps: 0, discount: 10 }, amountMinor: 1900 },
    { discount: { discount_bps: null, discount: 10 }, amountMinor: 1710 },
  ])(
    "imports the Dodo recurring price and preserves the other billing option: %j",
    async ({ discount, amountMinor }) => {
      settings.dodo_product_id_pro_year = "yearly_product";
      settings.dodo_brand_id = "brnd_actor_console";
      mockProductRetrieve.mockResolvedValue({
        product_id: "prod_month",
        name: "Actor Console Pro",
        brand_id: "brnd_actor_console",
        is_recurring: true,
        price: {
          type: "recurring_price",
          price: 1900,
          currency: "USD",
          ...discount,
          payment_frequency_count: 1,
          payment_frequency_interval: "Month",
          subscription_period_count: 1,
          subscription_period_interval: "Month",
        },
      });
      await importDodoProduct("prod_month", "month");
      expect(settings.dodo_product_id_pro_year).toBe("yearly_product");
      expect(await gatewayBillingOptions("dodo")).toEqual([
        { interval: "month", amountMinor, currency: "USD" },
        { interval: "year" },
      ]);
    },
  );

  it.each([
    { price: { type: "one_time_price" } },
    {
      price: {
        type: "recurring_price",
        payment_frequency_count: 1,
        payment_frequency_interval: "Year",
      },
    },
    {
      price: {
        type: "recurring_price",
        payment_frequency_count: 3,
        payment_frequency_interval: "Month",
      },
    },
    { brand_id: "brnd_other" },
  ])(
    "rejects incompatible Dodo products without changing checkout settings: %j",
    async (overrides) => {
      settings.dodo_brand_id = "brnd_actor_console";
      mockProductRetrieve.mockResolvedValue({
        product_id: "prod_month",
        brand_id: "brnd_actor_console",
        is_recurring: true,
        price: {
          type: "recurring_price",
          price: 1900,
          currency: "USD",
          discount: 0,
          payment_frequency_count: 1,
          payment_frequency_interval: "Month",
          subscription_period_count: 1,
          subscription_period_interval: "Month",
        },
        ...overrides,
      });
      await expect(importDodoProduct("prod_month", "month")).rejects.toThrow();
      expect(mockSetIntegration).not.toHaveBeenCalled();
    },
  );

  it("makes a gateway ready with only its yearly option configured", async () => {
    settings.dodo_webhook_secret = "test_webhook";
    settings.dodo_product_id_pro_year = "pdt_year";
    mockFindMany.mockResolvedValue(
      ["dodo_api_key", "dodo_webhook_secret", "dodo_product_id_pro_year"].map((key) => ({ key })),
    );
    expect(await gatewayReadiness("dodo")).toMatchObject({ ready: true, missingProducts: [] });
  });
});
