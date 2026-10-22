import "server-only";
import { cache } from "react";
import { SERVER_API_BASE_URL } from "./api-base";
import { selectProOffers, type CheckoutGateway } from "./pro-billing-offers";

/** Public discovery contains prices, never payment credentials or customer data. */
export const getPublicProOffers = cache(async () => {
  try {
    const response = await fetch(`${SERVER_API_BASE_URL}/payment-gateways`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: CheckoutGateway[] };
    // Sandbox amounts are not public subscription prices.
    return selectProOffers((body.data ?? []).filter((gateway) => gateway.mode !== "test"));
  } catch {
    // Keep pricing and its CTAs usable while checkout discovery is unavailable.
    return [];
  }
});
