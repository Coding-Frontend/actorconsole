import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicProOffers } from "./public-pro-offers";
afterEach(() => {
  vi.unstubAllGlobals();
});
const live = {
  key: "stripe",
  name: "Stripe",
  mode: "live",
  billingOptions: [{ interval: "month", currency: "USD", amountMinor: 1900 }],
};
describe("public subscription offers", () => {
  it("loads public live prices with a deadline and without customer cookies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                ...live,
                mode: "test",
                billingOptions: [{ interval: "month", amountMinor: 100, currency: "USD" }],
              },
              live,
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const offers = await getPublicProOffers();
    expect(offers).toHaveLength(1);
    expect(offers[0].option.amountMinor).toBe(1900);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/payment-gateways$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });
  it("does not publish sandbox prices as real subscriptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ data: [{ ...live, mode: "test" }] }))),
    );
    expect(await getPublicProOffers()).toEqual([]);
  });
  it.each(["http", "network", "invalid-json"])(
    "keeps pricing usable on %s errors",
    async (failure) => {
      const fetchMock =
        failure === "network"
          ? vi.fn().mockRejectedValue(new Error("offline"))
          : vi
              .fn()
              .mockResolvedValue(
                new Response("Unavailable", { status: failure === "http" ? 503 : 200 }),
              );
      vi.stubGlobal("fetch", fetchMock);
      expect(await getPublicProOffers()).toEqual([]);
    },
  );
});
