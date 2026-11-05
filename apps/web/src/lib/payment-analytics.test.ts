import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  consent: "all" as string | null,
  context: vi.fn(),
}));
vi.mock("@/components/cookie-consent", () => ({
  getConsent: () => mocks.consent,
}));
vi.mock("@/lib/firebase", () => ({
  getFirebasePaymentAnalyticsContext: mocks.context,
}));
import {
  paymentAnalyticsForCheckout,
  revokeBrowserPaymentAnalytics,
} from "./payment-analytics";

const key = "actorconsole.payment-analytics-tokens";
const context = {
  clientId: "1234.5678",
  measurementId: "G-FIXTURE",
  sessionId: "1793850000",
};
const token = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.consent = "all";
  mocks.context.mockResolvedValue(context);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe("payment attribution consent", () => {
  it.each([null, "essential"])(
    "does not load GA identity without analytics consent: %s",
    async (choice) => {
      mocks.consent = choice;
      expect(await paymentAnalyticsForCheckout()).toBeUndefined();
      expect(mocks.context).not.toHaveBeenCalled();
      expect(localStorage.getItem(key)).toBeNull();
    },
  );
  it("stores a revocation capability before including attribution with checkout", async () => {
    const result = await paymentAnalyticsForCheckout();
    expect(result).toMatchObject({ ...context, consent: true });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([result!.token]);
    expect(result!.token).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("does not include attribution if consent changes during SDK loading", async () => {
    mocks.context.mockImplementation(async () => {
      mocks.consent = "essential";
      return context;
    });
    expect(await paymentAnalyticsForCheckout()).toBeUndefined();
    expect(localStorage.getItem(key)).toBeNull();
  });
  it("bounds SDK waits so blocked analytics cannot block payment checkout", async () => {
    vi.useFakeTimers();
    mocks.context.mockImplementation(() => new Promise(() => {}));
    const pending = paymentAnalyticsForCheckout();
    await vi.advanceTimersByTimeAsync(750);
    expect(await pending).toBeUndefined();
  });
  it("keeps failed revocations for retry and removes only acknowledged tokens", async () => {
    mocks.consent = "essential";
    localStorage.setItem(key, JSON.stringify([token]));
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetcher);
    await revokeBrowserPaymentAnalytics();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([token]);
    await revokeBrowserPaymentAnalytics();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      tokens: [token],
    });
  });
});
