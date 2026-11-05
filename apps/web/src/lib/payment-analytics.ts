"use client";

import { getConsent } from "@/components/cookie-consent";
import { API_BASE_URL } from "@/lib/api-base";

const STORAGE_KEY = "actorconsole.payment-analytics-tokens";
const validToken = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
function tokens(): string[] {
  const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  if (!Array.isArray(stored) || !stored.every(validToken))
    throw new Error("Invalid consent token storage");
  return stored;
}

/** Analytics is optional: missing SDK identity or storage must not delay billing. */
export async function paymentAnalyticsForCheckout() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (typeof window === "undefined" || getConsent() !== "all")
      return undefined;
    const context = await Promise.race([
      import("@/lib/firebase").then((firebase) =>
        firebase.getFirebasePaymentAnalyticsContext(),
      ),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), 750);
      }),
    ]);
    if (!context || getConsent() !== "all") return undefined;
    const stored = tokens();
    if (stored.length >= 50) return undefined;
    const token = crypto.randomUUID();
    // Store before the request: an opt-out that overtakes checkout can revoke
    // this token even while the server has not received its attribution yet.
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...stored, token]));
    return { ...context, consent: true as const, token };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/** Works after sign-out as well: the token can only disable its own attribution. */
export async function revokeBrowserPaymentAnalytics() {
  try {
    if (typeof window === "undefined" || getConsent() === "all") return;
    const pending = tokens();
    if (!pending.length) return;
    const response = await fetch(`${API_BASE_URL}/billing/analytics/revoke`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokens: pending }),
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok)
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tokens().filter((token) => !pending.includes(token))),
      );
    // Failed revocations stay in storage and retry on the next mount/navigation.
  } catch {
    /* Optional analytics never changes the consent UI. */
  }
}
