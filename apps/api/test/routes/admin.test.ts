import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onErrorHandler } from "../../src/middleware/error.js";

const {
  mockDb,
  mockSetIntegration,
  mockDeleteIntegration,
  mockGetIntegration,
  mockImportProviderProduct,
} = vi.hoisted(() => ({
  mockDb: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: { deleteMany: vi.fn() },
    subscription: {
      count: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    businessProfile: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    paymentGateway: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    payment: {
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    actor: { count: vi.fn(), findMany: vi.fn() },
    bulkPublishSchedule: { count: vi.fn() },
    review: { count: vi.fn() },
    webhookDelivery: { count: vi.fn(), findMany: vi.fn() },
    appError: { count: vi.fn(), findMany: vi.fn() },
    ticket: { count: vi.fn(), findMany: vi.fn() },
    integration: { findMany: vi.fn(), findUnique: vi.fn() },
    planMarketingFeature: {
      findMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    planMarketingFeatureConfig: { upsert: vi.fn() },
    $transaction: vi.fn(),
    auditLog: { count: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    emailLog: { count: vi.fn(), findMany: vi.fn() },
    usageRecord: { count: vi.fn(), findMany: vi.fn() },
    usageDaily: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    newsletterSubscriber: { count: vi.fn(), findMany: vi.fn() },
    changelogEntry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    announcement: { findUnique: vi.fn(), delete: vi.fn() },
    faqItem: { findUnique: vi.fn(), delete: vi.fn() },
  },
  mockGetIntegration: vi.fn(),
  mockSetIntegration: vi.fn(),
  mockDeleteIntegration: vi.fn(),
  mockImportProviderProduct: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({ db: mockDb }));
vi.mock("../../src/lib/integrations.js", () => ({
  getIntegration: (...args: unknown[]) => mockGetIntegration(...args),
  setIntegration: (...args: unknown[]) => mockSetIntegration(...args),
  deleteIntegration: (...args: unknown[]) => mockDeleteIntegration(...args),
  recordIntegrationTest: vi.fn(),
}));
vi.mock("../../src/lib/analytics.js", () => ({ trackEvent: vi.fn() }));
vi.mock("../../src/lib/billing-providers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/billing-providers.js")>()),
  importProviderProduct: (...args: unknown[]) => mockImportProviderProduct(...args),
}));

import { adminRoutes } from "../../src/routes/admin.js";

function buildApp() {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.route("/admin", adminRoutes);
  return app;
}

function adminRequest(path: string, init?: RequestInit): Promise<Response> {
  return buildApp().request(path, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string>),
      "x-admin-api-key": "test-admin-key",
    },
  });
}

describe("Admin routes", () => {
  it.each(["stripe", "razorpay", "dodo"])(
    "verifies an existing %s yearly plan through the provider-specific import endpoint",
    async (key) => {
      mockImportProviderProduct.mockResolvedValue({
        productId: "existing_id",
        interval: "year",
        amountMinor: 19900,
        currency: "USD",
      });
      const response = await adminRequest(`/admin/payment-gateways/${key}/products/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: "existing_id", interval: "year", mode: "live" }),
      });
      expect(response.status).toBe(200);
      expect(mockImportProviderProduct).toHaveBeenCalledWith(key, "existing_id", "year", "live");
      expect(mockDb.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resource: `payment_gateway:${key}:PRO:year` }),
        }),
      );
    },
  );
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = "test-admin-key";
    mockDb.auditLog.create.mockResolvedValue({ id: "audit_1" });
    mockDb.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    );
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it("returns complete dashboard metrics without tolerating internal errors", async () => {
    mockDb.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8).mockResolvedValueOnce(2);
    mockDb.businessProfile.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);
    mockDb.subscription.count.mockResolvedValueOnce(2);
    mockDb.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: 2500 }, _count: 1 });
    mockDb.actor.count.mockResolvedValueOnce(25);
    mockDb.bulkPublishSchedule.count.mockResolvedValueOnce(3);
    mockDb.review.count.mockResolvedValueOnce(5);
    mockDb.webhookDelivery.count.mockResolvedValueOnce(6);
    mockDb.appError.count.mockResolvedValueOnce(0);
    mockDb.user.findMany.mockResolvedValueOnce([]);
    mockDb.businessProfile.groupBy.mockResolvedValueOnce([]);
    mockDb.ticket.count.mockResolvedValueOnce(1);

    const res = await adminRequest("/admin/metrics/overview");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.users.total).toBe(10);
    expect(body.data.platform.actors).toBe(25);
    expect(mockDb.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ billingMode: "live" }, { billingMode: null }] }),
      }),
    );
  });

  it("returns a paginated user list", async () => {
    mockDb.user.findMany.mockResolvedValueOnce([
      {
        id: "u1",
        email: "user@test.com",
        role: "USER",
        businessProfiles: [{ id: "bp1", name: "Workspace", plan: "FREE" }],
      },
    ]);
    mockDb.user.count.mockResolvedValueOnce(1);

    const res = await adminRequest("/admin/users?page=1&limit=10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it("filters and sorts the user directory", async () => {
    mockDb.user.findMany.mockResolvedValueOnce([]);
    mockDb.user.count.mockResolvedValueOnce(0);

    const res = await adminRequest(
      "/admin/users?search=owner&plan=PRO&role=USER&suspended=false&sort=email&order=asc&limit=25",
    );

    expect(res.status).toBe(200);
    expect(mockDb.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "USER",
          suspendedAt: null,
          businessProfiles: { some: { plan: "PRO" } },
        }),
        orderBy: { email: "asc" },
        take: 25,
      }),
    );
  });

  it("filters and sorts subscription records", async () => {
    mockDb.subscription.findMany.mockResolvedValueOnce([]);
    mockDb.subscription.count.mockResolvedValueOnce(0);

    const res = await adminRequest(
      "/admin/subscriptions?search=workspace&status=active&provider=manual&sort=currentPeriodEnd&order=asc&limit=25",
    );

    expect(res.status).toBe(200);
    expect(mockDb.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "active", provider: "manual" }),
        orderBy: { currentPeriodEnd: "asc" },
        take: 25,
      }),
    );
  });

  it("filters and sorts payment records and their summaries", async () => {
    mockDb.payment.findMany.mockResolvedValueOnce([]);
    mockDb.payment.count.mockResolvedValueOnce(0);
    mockDb.payment.groupBy.mockResolvedValueOnce([]);

    const res = await adminRequest(
      "/admin/payments?search=order&status=captured&provider=razorpay&currency=inr&sort=amount&order=desc&limit=100",
    );

    expect(res.status).toBe(200);
    expect(mockDb.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "captured",
          provider: "razorpay",
          currency: "INR",
        }),
        orderBy: { amount: "desc" },
        take: 100,
      }),
    );
    expect(mockDb.payment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ status: "captured", currency: "INR" }),
            { OR: [{ billingMode: "live" }, { billingMode: null }] },
          ],
        },
      }),
    );
  });

  it("filters operational support, webhook, error, audit, and email registries", async () => {
    mockDb.ticket.findMany.mockResolvedValueOnce([]);
    mockDb.ticket.count.mockResolvedValueOnce(0);
    expect(
      (
        await adminRequest(
          "/admin/support?q=login&status=OPEN&priority=URGENT&sort=createdAt&order=asc&limit=25",
        )
      ).status,
    ).toBe(200);
    expect(mockDb.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "OPEN", priority: "URGENT" }),
        orderBy: { createdAt: "asc" },
      }),
    );

    mockDb.webhookDelivery.findMany.mockResolvedValueOnce([]);
    mockDb.webhookDelivery.count.mockResolvedValueOnce(0);
    expect(
      (
        await adminRequest(
          "/admin/webhooks?search=invoice&source=stripe&status=failed&sort=responseMs&order=desc",
        )
      ).status,
    ).toBe(200);
    expect(mockDb.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { responseMs: "desc" } }),
    );

    mockDb.appError.findMany.mockResolvedValueOnce([]);
    mockDb.appError.count.mockResolvedValueOnce(0);
    expect(
      (
        await adminRequest(
          "/admin/errors?search=timeout&source=worker&severity=fatal&sort=fingerprint&order=asc",
        )
      ).status,
    ).toBe(200);
    expect(mockDb.appError.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: "worker", severity: "fatal" }),
        orderBy: { fingerprint: "asc" },
      }),
    );

    mockDb.auditLog.findMany.mockResolvedValueOnce([]);
    mockDb.auditLog.count.mockResolvedValueOnce(0);
    expect(
      (await adminRequest("/admin/audit-log?search=subscription&source=ui&sort=action&order=asc"))
        .status,
    ).toBe(200);
    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: "ui" }),
        orderBy: { action: "asc" },
      }),
    );

    mockDb.emailLog.findMany.mockResolvedValueOnce([]);
    mockDb.emailLog.count.mockResolvedValueOnce(0);
    expect(
      (
        await adminRequest(
          "/admin/email-log?search=owner&status=failed&template=invoice&sort=to&order=asc",
        )
      ).status,
    ).toBe(200);
    expect(mockDb.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "failed", template: "invoice" }),
        orderBy: { to: "asc" },
      }),
    );
  });

  it("filters and sorts usage records with user context", async () => {
    mockDb.usageRecord.findMany.mockResolvedValueOnce([]);
    mockDb.usageRecord.count.mockResolvedValueOnce(0);

    const res = await adminRequest(
      "/admin/usage?search=owner&metric=mcp_calls&month=8&year=2026&sort=metric&order=asc&limit=25",
    );

    expect(res.status).toBe(200);
    expect(mockDb.usageRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ month: 8, year: 2026, metric: "mcp_calls" }),
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { metric: "asc" },
        take: 25,
      }),
    );
  });

  it("filters and sorts usage-cost records and summaries consistently", async () => {
    mockDb.usageDaily.findMany.mockResolvedValueOnce([]);
    mockDb.usageDaily.count.mockResolvedValueOnce(0);

    const res = await adminRequest(
      "/admin/usage-costs?actorId=actor_1&search=maps&from=2026-08-01&to=2026-08-31&sort=usageCostUsd&order=desc&limit=25",
    );

    expect(res.status).toBe(200);
    expect(mockDb.usageDaily.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: "actor_1",
          actor: expect.objectContaining({ OR: expect.any(Array) }),
          date: expect.any(Object),
        }),
        orderBy: [{ usageCostUsd: "desc" }, { actorId: "asc" }],
        take: 25,
      }),
    );

    mockDb.usageDaily.aggregate.mockResolvedValueOnce({
      _sum: { usageCostUsd: 0, runs: 0 },
      _avg: { usageCostUsd: 0 },
    });
    mockDb.usageDaily.groupBy.mockResolvedValueOnce([]);

    const summary = await adminRequest(
      "/admin/usage-costs/summary?search=maps&from=2026-08-01&to=2026-08-31",
    );

    expect(summary.status).toBe(200);
    expect(mockDb.usageDaily.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actor: expect.objectContaining({ OR: expect.any(Array) }),
          date: expect.any(Object),
        }),
      }),
    );
  });

  it("filters and sorts newsletter subscribers", async () => {
    mockDb.newsletterSubscriber.findMany.mockResolvedValueOnce([]);
    mockDb.newsletterSubscriber.count.mockResolvedValueOnce(0);

    const res = await adminRequest(
      "/admin/newsletter?search=owner&status=ACTIVE&sort=email&order=asc&limit=25",
    );

    expect(res.status).toBe(200);
    expect(mockDb.newsletterSubscriber.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE" }),
        orderBy: { email: "asc" },
        take: 25,
      }),
    );
  });

  it("filters and sorts the cross-workspace Actor registry", async () => {
    mockDb.actor.findMany.mockResolvedValueOnce([]);
    mockDb.actor.count.mockResolvedValueOnce(0);

    const res = await adminRequest(
      "/admin/actors?search=maps&visibility=PRIVATE&deprecated=false&publishReady=true&sort=actorName&order=asc&page=2&limit=25",
    );

    expect(res.status).toBe(200);
    expect(mockDb.actor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeIsPublic: false,
          storeIsDeprecated: false,
          publishReady: true,
        }),
        orderBy: { actorName: "asc" },
        skip: 25,
        take: 25,
      }),
    );
    const call = mockDb.actor.findMany.mock.calls[0]?.[0];
    expect(call.where.OR).toContainEqual({ user: { email: { contains: "maps" } } });
  });

  it.each([
    ["announcement", "/admin/announcements/missing"],
    ["faqItem", "/admin/faq/missing"],
  ] as const)("returns a precise 404 when deleting a missing %s", async (model, path) => {
    mockDb[model].findUnique.mockResolvedValueOnce(null);

    const res = await adminRequest(path, { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(mockDb[model].delete).not.toHaveBeenCalled();
  });

  it("returns user details and a precise 404", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "user@test.com",
      role: "USER",
      plan: "FREE",
    });
    expect((await adminRequest("/admin/users/u1")).status).toBe(200);

    mockDb.user.findUnique.mockResolvedValueOnce(null);
    expect((await adminRequest("/admin/users/unknown")).status).toBe(404);
  });

  it("updates a user's role through the real PATCH route", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({ id: "u1", role: "USER" });
    mockDb.user.update.mockResolvedValueOnce({ id: "u1", role: "ADMIN" });

    const res = await adminRequest("/admin/users/u1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "ADMIN" }),
    });
    expect(res.status).toBe(200);
    expect(mockDb.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ role: "ADMIN" }),
      }),
    );
  });

  it("rejects account-level plan updates", async () => {
    const res = await adminRequest("/admin/users/u1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "PRO" }),
    });
    expect(res.status).toBe(400);
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("assigns Pro to one workspace from the admin panel", async () => {
    mockDb.businessProfile.findUnique.mockResolvedValueOnce({
      id: "bp1",
      userId: "u1",
      name: "Pro workspace",
      plan: "FREE",
      subscriptions: [],
    });
    mockDb.businessProfile.update.mockResolvedValueOnce({ id: "bp1", plan: "PRO" });
    mockDb.subscription.upsert.mockResolvedValueOnce({
      id: "sub1",
      businessProfileId: "bp1",
      status: "active",
    });

    const res = await adminRequest("/admin/business-profiles/bp1/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "PRO", days: 365 }),
    });

    expect(res.status).toBe(200);
    expect(mockDb.businessProfile.update).toHaveBeenCalledWith({
      where: { id: "bp1" },
      data: { plan: "PRO" },
    });
    expect(mockDb.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessProfileId: "bp1" } }),
    );
  });

  it("rejects retired workspace plan values", async () => {
    const res = await adminRequest("/admin/business-profiles/bp1/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "STUDIO", days: 365 }),
    });

    expect(res.status).toBe(400);
    expect(mockDb.businessProfile.update).not.toHaveBeenCalled();
  });

  it("returns the integration catalog", async () => {
    mockDb.integration.findMany.mockResolvedValueOnce([]);
    const res = await adminRequest("/admin/integrations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.some((item: { key: string }) => item.key === "apify_webhook_secret")).toBe(
      false,
    );
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "openai_api_key", isSecret: true }),
        expect.objectContaining({ key: "gemini_api_key", isSecret: true }),
        expect.objectContaining({ key: "email_provider", defaultValue: "resend" }),
        expect.objectContaining({ key: "smtp_host", category: "email", testable: true }),
        expect.objectContaining({ key: "apify_api_token", category: "apify", testable: true }),
        expect.objectContaining({ key: "apify_ui_token", category: "apify" }),
        expect.objectContaining({ key: "apify_cookies", category: "apify" }),
      ]),
    );
  });

  it("marks the healthy Apify Console fallback as active", async () => {
    mockDb.integration.findMany.mockResolvedValueOnce([
      { key: "apify_api_token", value: "encrypted-api", testStatus: "ok" },
      { key: "apify_ui_token", value: "encrypted-ui", testStatus: "error" },
      { key: "apify_cookies", value: "encrypted-cookies", testStatus: "ok" },
    ]);

    const res = await adminRequest("/admin/integrations");
    const body = await res.json();
    const byKey = Object.fromEntries(
      body.data
        .filter((item: { key: string }) => item.key.startsWith("apify_"))
        .map((item: { key: string; isActive?: boolean }) => [item.key, item]),
    );

    expect(res.status).toBe(200);
    expect(byKey.apify_api_token.isActive).toBe(true);
    expect(byKey.apify_ui_token.isActive).toBe(false);
    expect(byKey.apify_ui_token.activeConsoleCredential).toBe("apify_cookies");
    expect(byKey.apify_cookies.isActive).toBe(true);
  });

  it("prefers cookies when both Console credentials are healthy", async () => {
    mockDb.integration.findMany.mockResolvedValueOnce([
      { key: "apify_ui_token", value: "encrypted-ui", testStatus: "ok" },
      { key: "apify_cookies", value: "encrypted-cookies", testStatus: "ok" },
    ]);
    const res = await adminRequest("/admin/integrations");
    const body = await res.json();
    expect(body.data.find((item: { key: string }) => item.key === "apify_ui_token")).toMatchObject({
      isActive: false,
      activeConsoleCredential: "apify_cookies",
    });
  });

  it("reports cookie authentication on the optional UI-key detail", async () => {
    mockDb.integration.findUnique.mockResolvedValueOnce(null);
    mockDb.integration.findMany.mockResolvedValueOnce([
      { key: "apify_cookies", value: "encrypted-cookies", testStatus: "ok" },
    ]);
    const res = await adminRequest("/admin/integrations/apify_ui_token");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      isConfigured: false,
      isActive: false,
      activeConsoleCredential: "apify_cookies",
    });
  });

  it("rejects the removed webhook integration", async () => {
    const res = await adminRequest("/admin/integrations/apify_webhook_secret", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "obsolete-secret" }),
    });
    expect(res.status).toBe(404);
    expect(mockSetIntegration).not.toHaveBeenCalled();
  });

  it("updates a known integration", async () => {
    mockDb.integration.findUnique.mockResolvedValueOnce(null);
    mockSetIntegration.mockResolvedValueOnce(undefined);
    const res = await adminRequest("/admin/integrations/apify_api_token", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "apify_api_token_testvalue123456789" }),
    });
    expect(res.status).toBe(200);
    expect(mockSetIntegration).toHaveBeenCalledOnce();
  });

  it("lists payment profiles without exposing secrets or listing payments as integrations", async () => {
    mockDb.paymentGateway.findMany.mockResolvedValue([
      { key: "stripe", name: "Stripe", config: { mode: "test" } },
    ]);
    mockDb.paymentGateway.findUnique.mockResolvedValue({ key: "stripe", config: { mode: "test" } });
    const settings: Record<string, string> = {
      stripe_test_secret_key: "sk_test_private",
      stripe_test_publishable_key: "pk_test_public",
      stripe_test_webhook_secret: "whsec_private",
      stripe_test_price_id_pro_year: "price_year",
    };
    mockGetIntegration.mockImplementation(async (key: string) => settings[key] ?? null);
    const response = await adminRequest("/admin/payment-gateways");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data[0].mode).toBe("test");
    expect(body.data[0].profiles).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain("sk_test_private");
    expect(JSON.stringify(body)).not.toContain("whsec_private");
    expect(body.data[0].profiles[0].readiness.ready).toBe(true);
    mockDb.integration.findMany.mockResolvedValue([]);
    const integrations = await (await adminRequest("/admin/integrations")).json();
    expect(
      integrations.data.some((field: { category: string }) => field.category === "payment"),
    ).toBe(false);
  });

  it("rejects payment writes through the old integrations endpoint", async () => {
    const response = await adminRequest("/admin/integrations/stripe_secret_key", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "sk_test_private" }),
    });
    expect(response.status).toBe(409);
    expect(mockSetIntegration).not.toHaveBeenCalled();
  });

  it("saves a payment profile and audits field names without credentials", async () => {
    mockDb.paymentGateway.findUnique.mockResolvedValue({
      key: "stripe",
      config: { mode: "test", managedModes: ["test"] },
    });
    mockDb.paymentGateway.update.mockResolvedValue({});
    mockGetIntegration.mockResolvedValue(null);
    const response = await adminRequest("/admin/payment-gateways/stripe/configuration", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "live", settings: { stripe_secret_key: "sk_live_private" } }),
    });
    expect(response.status).toBe(200);
    expect(mockSetIntegration).toHaveBeenCalledWith(
      "stripe_live_secret_key",
      "sk_live_private",
      expect.objectContaining({ isSecret: true }),
    );
    expect(JSON.stringify(mockDb.auditLog.create.mock.calls)).not.toContain("sk_live_private");
    expect(mockDb.paymentGateway.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { config: { mode: "test", managedModes: ["test", "live"] } },
      }),
    );
  });

  it("rejects selecting an incomplete mode on an enabled gateway", async () => {
    mockDb.paymentGateway.findUnique.mockResolvedValue({
      key: "stripe",
      enabled: true,
      config: { mode: "test", managedModes: ["test"] },
    });
    mockGetIntegration.mockResolvedValue(null);
    const response = await adminRequest("/admin/payment-gateways/stripe/mode", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "live" }),
    });
    expect(response.status).toBe(409);
    expect(mockDb.paymentGateway.update).not.toHaveBeenCalled();
  });

  it("stores only ApifyRT from an admin resume cURL", async () => {
    mockDb.integration.findUnique.mockResolvedValueOnce(null);
    mockSetIntegration.mockResolvedValueOnce(undefined);
    const copiedRequest = [
      "curl --location 'https://console-backend.apify.com/public/authentication/resume' \\",
      "--header 'origin: https://console.apify.com' \\",
      "--header 'Cookie: ApifyRT=dummy-refresh; ApifyProdUserId=dummy-user;' \\",
      '--data \'{"viewedUserId":"","forceAdminToken":false}\'',
    ].join("\n");

    const res = await adminRequest("/admin/integrations/apify_cookies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: copiedRequest }),
    });

    expect(res.status).toBe(200);
    expect(mockSetIntegration).toHaveBeenCalledWith(
      "apify_cookies",
      "ApifyRT=dummy-refresh",
      expect.objectContaining({ category: "apify", isSecret: true }),
    );
  });

  it("removes a known integration", async () => {
    mockDb.integration.findUnique.mockResolvedValueOnce({ value: "encrypted" });
    mockDeleteIntegration.mockResolvedValueOnce(undefined);
    const res = await adminRequest("/admin/integrations/apify_api_token", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(mockDeleteIntegration).toHaveBeenCalledWith("apify_api_token");
  });

  it("reads and updates database-backed plan marketing copy", async () => {
    mockDb.planMarketingFeature.findMany.mockResolvedValueOnce([
      { plan: "PRO", label: "AI-assisted workflows", enabled: true, sortOrder: 0 },
    ]);
    const getResponse = await adminRequest("/admin/plan-features");
    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()).data[0].label).toBe("AI-assisted workflows");

    mockDb.planMarketingFeature.findMany
      .mockResolvedValueOnce([{ plan: "PRO", label: "Old copy", enabled: true, sortOrder: 0 }])
      .mockResolvedValueOnce([{ plan: "PRO", label: "New copy", enabled: true, sortOrder: 0 }]);
    mockDb.$transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        planMarketingFeature: {
          deleteMany: mockDb.planMarketingFeature.deleteMany,
          createMany: mockDb.planMarketingFeature.createMany,
        },
        planMarketingFeatureConfig: {
          upsert: mockDb.planMarketingFeatureConfig.upsert,
        },
      }),
    );

    const putResponse = await adminRequest("/admin/plan-features/PRO", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features: [{ label: "New copy", enabled: true }] }),
    });
    expect(putResponse.status).toBe(200);
    expect(mockDb.planMarketingFeature.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ plan: "PRO", label: "New copy", enabled: true, sortOrder: 0 }],
      }),
    );
    expect(mockDb.planMarketingFeatureConfig.upsert).toHaveBeenCalledWith({
      where: { plan: "PRO" },
      create: { plan: "PRO", managed: true },
      update: { managed: true },
    });
    expect(mockDb.auditLog.create).toHaveBeenCalled();
  });
});

describe("Admin changelog editor API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = "test-admin-key";
    mockDb.auditLog.create.mockResolvedValue({ id: "audit" });
  });
  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
  });
  const payload = {
    title: "New dashboard",
    slug: "new-dashboard",
    text: "Summary",
    body: "## Details",
    category: "RELEASE",
    tags: ["api", "dashboard", "api"],
    releaseDate: "2026-10-05",
  };
  const request = (body: unknown, path = "/admin/changelog/entries", method = "POST") =>
    adminRequest(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  it("creates a draft article and deduplicated product tags", async () => {
    mockDb.changelogEntry.create.mockResolvedValue({ id: "new", ...payload });
    const res = await request(payload);
    expect(res.status).toBe(201);
    expect(mockDb.changelogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: payload.title,
        slug: payload.slug,
        body: payload.body,
        category: "RELEASE",
        isPublished: false,
        publishedAt: null,
        tags: { create: [{ tag: "api" }, { tag: "dashboard" }] },
      }),
    });
  });
  it("supports existing clients sending only text", async () => {
    mockDb.changelogEntry.create.mockResolvedValue({ id: "legacy" });
    expect((await request({ text: "Legacy update" })).status).toBe(201);
    expect(mockDb.changelogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Legacy update",
        slug: expect.stringMatching(/^update-/),
        category: "RELEASE",
      }),
    });
  });
  it.each([
    { slug: "feed" },
    { releaseDate: "2026-02-30" },
    { tags: ["not a tag"] },
    { category: "WRONG" },
  ])("validates editor fields: %j", async (change) => {
    expect((await request({ ...payload, ...change })).status).toBe(400);
    expect(mockDb.changelogEntry.create).not.toHaveBeenCalled();
  });
  it("returns a useful duplicate slug error", async () => {
    mockDb.changelogEntry.create.mockRejectedValue({ code: "P2002" });
    const res = await request(payload);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("slug_conflict");
  });
  it("preserves shared URLs when an article is edited", async () => {
    mockDb.changelogEntry.findUnique.mockResolvedValue({
      id: "new",
      slug: "original",
      isPublished: true,
    });
    const res = await request({ slug: "changed" }, "/admin/changelog/entries/new", "PATCH");
    expect(res.status).toBe(400);
    expect(mockDb.changelogEntry.update).not.toHaveBeenCalled();
  });
  it("atomically replaces tags and publishes an edited draft", async () => {
    mockDb.changelogEntry.findUnique.mockResolvedValue({
      id: "new",
      slug: payload.slug,
      isPublished: false,
    });
    mockDb.changelogEntry.update.mockResolvedValue({ id: "new" });
    const res = await request(
      { tags: ["billing"], body: "Updated", isPublished: true },
      "/admin/changelog/entries/new",
      "PATCH",
    );
    expect(res.status).toBe(200);
    expect(mockDb.changelogEntry.update).toHaveBeenCalledWith({
      where: { id: "new" },
      data: expect.objectContaining({
        tags: { deleteMany: {}, create: [{ tag: "billing" }] },
        body: "Updated",
        publishedAt: expect.any(Date),
      }),
    });
  });
  it("lists tags as strings and includes titles in admin search", async () => {
    mockDb.changelogEntry.findMany.mockResolvedValue([{ id: "new", tags: [{ tag: "api" }] }]);
    mockDb.changelogEntry.count.mockResolvedValue(1);
    const res = await adminRequest("/admin/changelog/entries?search=dashboard");
    expect((await res.json()).data.items[0].tags).toEqual(["api"]);
    expect(mockDb.changelogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ title: { contains: "dashboard" } }]),
        }),
      }),
    );
  });
});
