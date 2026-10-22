import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockGatewayReadiness = vi.fn();

vi.mock("@actorconsole/db", () => ({
  db: {
    paymentGateway: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("../../src/lib/billing-providers.js", () => ({
  gatewayReadiness: (...args: unknown[]) => mockGatewayReadiness(...args),
  gatewayBillingOptions: async () => [{ interval: "month" }, { interval: "year" }],
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
  isValidPaymentGateway: (key: string) => ["stripe", "razorpay", "dodo"].includes(key),
}));

import { paymentGatewayRoutes } from "../../src/routes/payment-gateways.js";

function buildApp() {
  const app = new Hono();
  app.route("/payment-gateways", paymentGatewayRoutes);
  return app;
}

describe("Payment gateway routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGatewayReadiness.mockResolvedValue({ ready: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /payment-gateways/", () => {
    it("returns enabled gateways sorted by sortOrder", async () => {
      mockFindMany.mockResolvedValueOnce([
        { key: "stripe", name: "Stripe", sortOrder: 1 },
        { key: "razorpay", name: "Razorpay", sortOrder: 2 },
        { key: "dodo", name: "Dodo Payments", sortOrder: 3 },
      ]);

      const res = await buildApp().request("/payment-gateways");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.map((gateway: { key: string }) => gateway.key)).toEqual([
        "stripe",
        "razorpay",
        "dodo",
      ]);
    });

    it("hides an enabled gateway until its credentials and product are ready", async () => {
      mockFindMany.mockResolvedValueOnce([
        { key: "stripe", name: "Stripe", sortOrder: 1 },
        { key: "razorpay", name: "Razorpay", sortOrder: 2 },
      ]);
      mockGatewayReadiness.mockImplementation(async (key: string) => ({
        ready: key === "razorpay",
      }));

      const res = await buildApp().request("/payment-gateways");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([
        {
          key: "razorpay",
          name: "Razorpay",
          sortOrder: 2,
          billingOptions: [{ interval: "month" }, { interval: "year" }],
        },
      ]);
    });

    it("returns empty array when no gateways enabled", async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const res = await buildApp().request("/payment-gateways");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual([]);
    });
  });

  describe("GET /payment-gateways/all", () => {
    it("does not expose the admin gateway list publicly", async () => {
      const res = await buildApp().request("/payment-gateways/all");
      expect(res.status).toBe(404);
    });
  });
});
