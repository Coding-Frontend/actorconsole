import { z } from "zod";

/**
 * Apify Store currently supports pay-per-event pricing for ActorConsole
 * writes. Keep the broader read type in `types/pricing.ts` so historical
 * actor records can still be displayed, but never create new legacy pricing
 * configurations.
 */
export const pricingModelSchema = z.literal("PAY_PER_EVENT");

export const payPerEventConfigSchema = z.object({
  eventPriceUsd: z.number().nonnegative(),
  eventTitle: z.string().min(1),
  eventDescription: z.string().optional(),
  isOneTimeEvent: z.boolean().optional(),
  isPrimaryEvent: z.boolean().optional(),
});

export const actorPricingSchema = z.object({
  model: pricingModelSchema,
  amount: z.number().nonnegative().nullable().default(null),
  currency: z.literal("USD").default("USD"),
  events: z
    .record(z.string(), payPerEventConfigSchema)
    .refine((events) => Object.keys(events).length > 0, "At least one charge event is required")
    .refine(
      (events) => Object.values(events).filter((event) => event.isPrimaryEvent).length <= 1,
      "Only one charge event can be primary",
    ),
});

export const setPricingSchema = z.object({
  apifyActorId: z.string().min(1),
  pricing: actorPricingSchema,
  reason: z.string().optional(),
});

export type SetPricingInput = z.infer<typeof setPricingSchema>;
