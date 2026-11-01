import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  claim: vi.fn(),
  plan: vi.fn(),
  retrieve: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@actorconsole/db", () => ({
  db: {
    subscription: { findUnique: mocks.find },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../../src/lib/billing-checkout-operations.js", () => ({ lockBillingWorkspace: vi.fn() }));
vi.mock("../../src/lib/billing-providers.js", () => ({
  retrieveProviderSubscription: mocks.retrieve,
}));
vi.mock("../../src/lib/payment-gateway-settings.js", () => ({
  subscriptionMatchesMode: async () => true,
  getGatewayContext: async () => ({ mode: "test" }),
}));
import { reconcileBillingSubscription } from "../../src/lib/billing-state.js";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue({
    id: "local",
    provider: "razorpay",
    status: "created",
    stateVersion: 0,
    providerSubscriptionId: "sub1",
    razorpaySubscriptionId: "sub1",
    billingMode: "test",
  });
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation((fn) =>
    fn({
      subscription: { findUnique: mocks.find, updateMany: mocks.claim },
      businessProfile: { update: mocks.plan },
    }),
  );
});
it.each([
  ["created", false, "FREE"],
  ["authenticated", false, "FREE"],
  ["active", false, "FREE"],
  ["active", true, "PRO"],
])(
  "reconciles %s (paid=%s) to %s even when provisional checkout is requested",
  async (status, paymentBacked, expectedPlan) => {
    mocks.retrieve.mockResolvedValue({
      id: "sub1",
      status,
      paymentBacked,
      periodEnd: new Date(Date.now() + 86400_000),
      cancelAtPeriodEnd: false,
      metadata: { businessProfileId: "w1" },
    });
    await reconcileBillingSubscription({
      context: { gateway: "razorpay", mode: "test", legacyFallback: false },
      id: "sub1",
      businessProfileId: "w1",
      provisionalCheckout: true,
    });
    expect(mocks.plan).toHaveBeenCalledWith({ where: { id: "w1" }, data: { plan: expectedPlan } });
  },
);
