import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payment } from "@prisma/client";
import { context } from "@opentelemetry/api";
import { isTracingSuppressed } from "@opentelemetry/core";

const mocks = vi.hoisted(() => ({
  attribution: { upsert: vi.fn(), findUnique: vi.fn() },
  events: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
  },
  payment: { findUnique: vi.fn() },
}));
vi.mock("./client.js", () => ({
  db: {
    paymentAnalyticsAttribution: mocks.attribution,
    paymentAnalyticsEvent: mocks.events,
    payment: mocks.payment,
  },
}));
import { db } from "./client.js";
import {
  bindPaymentAnalyticsAttribution,
  dispatchPaymentAnalytics,
  queuePaymentAnalytics,
  revokePaymentAnalytics,
} from "./payment-analytics.js";

const payment = {
  id: "private-payment",
  userId: "private-user",
  analyticsAttributionId: "attribution",
  billingMode: "live",
  provider: "stripe",
  amount: 19,
  currency: "USD",
} as unknown as Payment;
const consent = {
  id: "attribution",
  userId: "private-user",
  clientId: "12345.67890",
  sessionId: String(Math.floor(Date.now() / 1000) - 10),
  measurementId: "G-FIXTURE",
  interval: "month",
  revokedAt: null,
  expiresAt: new Date(Date.now() + 86_400_000),
};
const input = {
  consent: true as const,
  token: "11111111-1111-4111-8111-111111111111",
  clientId: consent.clientId,
  measurementId: consent.measurementId,
};
let events: Map<string, any>;
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  events = new Map();
  vi.stubEnv("GA4_MEASUREMENT_ID", "G-FIXTURE");
  vi.stubEnv("GA4_API_SECRET", "private-api-secret");
  vi.stubEnv("GA4_INCLUDE_TEST_PAYMENTS", "false");
  mocks.attribution.findUnique.mockResolvedValue({ ...consent });
  mocks.attribution.upsert.mockImplementation(async ({ create }) => ({
    ...create,
    revokedAt: null,
  }));
  mocks.payment.findUnique.mockResolvedValue(payment);
  mocks.events.upsert.mockImplementation(async ({ create }) => {
    if (!events.has(create.id))
      events.set(create.id, {
        ...create,
        status: "pending",
        attempts: 0,
        leaseToken: null,
        createdAt: new Date(),
        availableAt: new Date(),
      });
    return events.get(create.id);
  });
  mocks.events.findMany.mockImplementation(async () =>
    [...events.values()]
      .filter((row) => ["pending", "claimed", "sending"].includes(row.status))
      .map((row) => ({ ...row })),
  );
  mocks.events.findFirst.mockImplementation(async ({ where }) =>
    [...events.values()].find(
      (row) => row.paymentId === where.paymentId && row.name === where.name,
    ),
  );
  mocks.events.updateMany.mockImplementation(async ({ where, data }) => {
    const row = events.get(where.id);
    if (
      !row ||
      (typeof where.status === "string" && row.status !== where.status) ||
      (where.status?.in && !where.status.in.includes(row.status)) ||
      (where.leaseToken !== undefined && row.leaseToken !== where.leaseToken)
    )
      return { count: 0 };
    Object.assign(row, {
      ...data,
      ...(data.attempts
        ? { attempts: row.attempts + data.attempts.increment }
        : {}),
    });
    return { count: 1 };
  });
  fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const store = () => db as any;

describe("checkout attribution", () => {
  it("requires explicit consent and the configured stream", async () => {
    expect(
      await bindPaymentAnalyticsAttribution(
        store(),
        undefined,
        "private-user",
        "month",
      ),
    ).toBeNull();
    expect(
      await bindPaymentAnalyticsAttribution(
        store(),
        { ...input, measurementId: "G-OTHER" },
        "private-user",
        "month",
      ),
    ).toBeNull();
    expect(mocks.attribution.upsert).not.toHaveBeenCalled();
    expect(
      await bindPaymentAnalyticsAttribution(
        store(),
        input,
        "private-user",
        "month",
      ),
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(mocks.attribution.upsert.mock.calls)).not.toContain(
      input.token,
    );
  });
  it("does not revive an attribution revoked before checkout arrived", async () => {
    mocks.attribution.upsert.mockResolvedValue({
      ...consent,
      revokedAt: new Date(),
    });
    expect(
      await bindPaymentAnalyticsAttribution(
        store(),
        input,
        "private-user",
        "month",
      ),
    ).toBeNull();
    expect(mocks.attribution.upsert.mock.calls[0][0].update).toEqual({});
  });
  it("revokes by hashed token and erases the stored GA identifiers", async () => {
    await revokePaymentAnalytics([input.token]);
    const args = mocks.attribution.upsert.mock.calls[0][0];
    expect(args.where.id).toMatch(/^[a-f0-9]{64}$/);
    expect(args.update).toMatchObject({ clientId: null, sessionId: null });
    expect(args.update.revokedAt).toBeInstanceOf(Date);
  });
});

describe("payment analytics delivery", () => {
  it("suppresses automatic tracing around the API-secret-bearing request", async () => {
    const tracedContext = vi.spyOn(context, "with");
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    await dispatchPaymentAnalytics();
    expect(tracedContext).toHaveBeenCalledOnce();
    expect(isTracingSuppressed(tracedContext.mock.calls[0][0])).toBe(true);
  });
  it("deduplicates webhook topics/replays and sends only the consented ecommerce payload", async () => {
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    await dispatchPaymentAnalytics();
    await dispatchPaymentAnalytics();
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0];
    expect(url.searchParams.get("api_secret")).toBe("private-api-secret");
    const payload = JSON.parse(request.body);
    expect(payload).toMatchObject({
      client_id: "12345.67890",
      consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" },
    });
    expect(payload.events[0]).toMatchObject({
      name: "purchase",
      params: {
        transaction_id: expect.stringMatching(/^ac_[a-f0-9]{64}$/),
        currency: "USD",
        value: 19,
        items: [{ item_id: "pro", price: 19, quantity: 1 }],
      },
    });
    expect(request.body).not.toMatch(
      /private-payment|private-user|private-api-secret/,
    );
  });
  it("skips unknown consent, test payments by default, and zero-value invoices", async () => {
    await queuePaymentAnalytics(
      store(),
      { ...payment, analyticsAttributionId: null },
      "purchase",
      19,
    );
    await queuePaymentAnalytics(
      store(),
      { ...payment, billingMode: "test" },
      "purchase",
      19,
    );
    await queuePaymentAnalytics(store(), payment, "purchase", 0);
    expect(events.size).toBe(0);
  });
  it("marks explicitly enabled test payments for DebugView", async () => {
    vi.stubEnv("GA4_INCLUDE_TEST_PAYMENTS", "true");
    const testPayment = { ...payment, billingMode: "test" };
    mocks.payment.findUnique.mockResolvedValue(testPayment);
    await queuePaymentAnalytics(store(), testPayment, "purchase", 19);
    await dispatchPaymentAnalytics();
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).events[0].params,
    ).toMatchObject({ payment_mode: "test", debug_mode: true });
  });
  it("checks revocation again immediately before sending queued events", async () => {
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    mocks.attribution.findUnique.mockResolvedValue({
      ...consent,
      revokedAt: new Date(),
    });
    await dispatchPaymentAnalytics();
    expect(fetcher).not.toHaveBeenCalled();
    expect([...events.values()][0].status).toBe("discarded");
  });
  it("keeps events queued while the server API secret is missing", async () => {
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    vi.stubEnv("GA4_API_SECRET", "");
    await dispatchPaymentAnalytics();
    expect(fetcher).not.toHaveBeenCalled();
    expect([...events.values()][0].status).toBe("pending");
  });
  it("expires old events rather than changing their timestamp to inflate current revenue", async () => {
    await queuePaymentAnalytics(
      store(),
      payment,
      "purchase",
      19,
      new Date(Date.now() - 4 * 86_400_000),
    );
    await dispatchPaymentAnalytics();
    expect(fetcher).not.toHaveBeenCalled();
    expect([...events.values()][0].lastError).toBe("event_expired_or_invalid");
  });
  it("retries purchase transport errors with the same transaction ID", async () => {
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    fetcher.mockRejectedValueOnce(
      new Error("transport failed with secret URL"),
    );
    await dispatchPaymentAnalytics();
    expect([...events.values()][0]).toMatchObject({
      status: "pending",
      lastError: "transport_error",
    });
    await dispatchPaymentAnalytics();
    const params = fetcher.mock.calls.map(
      ([, request]) => JSON.parse(request.body).events[0].params,
    );
    expect(params[0].transaction_id).toBe(params[1].transaction_id);
    expect([...events.values()][0].status).toBe("sent");
  });
  it("sends partial refund amounts against the original purchase transaction", async () => {
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    await dispatchPaymentAnalytics();
    await queuePaymentAnalytics(
      store(),
      payment,
      "refund",
      3,
      new Date(),
      "3.000",
    );
    await queuePaymentAnalytics(
      store(),
      payment,
      "refund",
      5,
      new Date(),
      "8.000",
    );
    await dispatchPaymentAnalytics();
    const payloads = fetcher.mock.calls.map(
      ([, request]) => JSON.parse(request.body).events[0],
    );
    expect(payloads.map((event) => [event.name, event.params.value])).toEqual([
      ["purchase", 19],
      ["refund", 3],
      ["refund", 5],
    ]);
    expect(
      new Set(payloads.map((event) => event.params.transaction_id)).size,
    ).toBe(1);
    expect(payloads[1].params).not.toHaveProperty("items");
  });
  it("quarantines ambiguous refund delivery instead of retrying and double-counting it", async () => {
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    await dispatchPaymentAnalytics();
    await queuePaymentAnalytics(
      store(),
      payment,
      "refund",
      3,
      new Date(),
      "3.000",
    );
    fetcher.mockRejectedValueOnce(new Error("timeout"));
    await dispatchPaymentAnalytics();
    await dispatchPaymentAnalytics();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      [...events.values()].find((event) => event.name === "refund"),
    ).toMatchObject({ status: "uncertain", lastError: "transport_error" });
  });
  it("does not attach renewal payments to an old checkout session", async () => {
    mocks.attribution.findUnique.mockResolvedValue({
      ...consent,
      sessionId: String(Math.floor(Date.now() / 1000) - 2 * 86_400),
    });
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    await dispatchPaymentAnalytics();
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).events[0].params,
    ).not.toHaveProperty("session_id");
  });

  it("lets only one concurrent worker send a claimed event", async () => {
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    await Promise.all([dispatchPaymentAnalytics(), dispatchPaymentAnalytics()]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not resend a refund whose previous sending lease expired", async () => {
    await queuePaymentAnalytics(store(), payment, "purchase", 19);
    await dispatchPaymentAnalytics();
    await queuePaymentAnalytics(
      store(),
      payment,
      "refund",
      3,
      new Date(),
      "3.000",
    );
    const refund = [...events.values()].find((row) => row.name === "refund");
    Object.assign(refund, {
      status: "sending",
      leaseToken: "old-lease",
      leaseExpiresAt: new Date(0),
    });
    await dispatchPaymentAnalytics();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(refund).toMatchObject({
      status: "uncertain",
      lastError: "delivery_interrupted",
    });
  });

  it.each([
    [429, "pending"],
    [503, "uncertain"],
    [400, "discarded"],
  ])(
    "handles refund HTTP %s without unsafe retries",
    async (httpStatus, expected) => {
      await queuePaymentAnalytics(store(), payment, "purchase", 19);
      await dispatchPaymentAnalytics();
      await queuePaymentAnalytics(
        store(),
        payment,
        "refund",
        3,
        new Date(),
        "3.000",
      );
      fetcher.mockResolvedValueOnce(
        new Response(null, { status: Number(httpStatus) }),
      );
      await dispatchPaymentAnalytics();
      expect(
        [...events.values()].find((row) => row.name === "refund").status,
      ).toBe(expected);
    },
  );
});
