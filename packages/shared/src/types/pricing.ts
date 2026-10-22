export type PricingModel =
  "FREE" | "FLAT_PRICE_PER_MONTH" | "PRICE_PER_DATASET_ITEM" | "PAY_PER_EVENT";

export interface ActorPricing {
  model: PricingModel;
  /** USD amount per the model's billing unit. */
  amount: number | null;
  currency: "USD";
  /** For PAY_PER_EVENT — full event map. */
  events?: Record<string, PayPerEventConfig>;
  /** Display unit ("per result", "per month"). */
  unitName?: string;
  /** Trial window for FLAT_PRICE_PER_MONTH. */
  trialMinutes?: number;
}

export interface PayPerEventConfig {
  eventPriceUsd: number;
  eventTitle: string;
  eventDescription?: string;
}
