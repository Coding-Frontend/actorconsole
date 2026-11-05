import { z } from "zod";

export const paymentAnalyticsInput = z
  .object({
    consent: z.literal(true),
    token: z.string().uuid(),
    clientId: z
      .string()
      .regex(/^\d{1,40}\.\d{1,40}$/)
      .max(128),
    measurementId: z
      .string()
      .regex(/^G-[A-Z0-9]+$/)
      .max(32),
    sessionId: z
      .string()
      .regex(/^[1-9]\d{0,15}$/)
      .optional(),
  })
  .strict();

export function hasAnalyticsConsent(cookie: string | undefined) {
  return /(?:^|;\s*)actorconsole-consent=all(?:;|$)/.test(cookie ?? "");
}
