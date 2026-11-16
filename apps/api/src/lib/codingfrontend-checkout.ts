import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { BillingInterval } from "@actorconsole/shared";
import { apiEnv } from "../config/env.js";
import { getPaymentSetting, type GatewayContext } from "./payment-gateway-settings.js";

const liveOrigin = "https://codingfrontend.in";
export const codingFrontendSecretKey = (interval: BillingInterval) =>
  `codingfrontend_webhook_secret_${interval}`;

const hostedPlan = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  amount: z.number().int().min(100).max(100_000_000),
  currency: z.enum(["USD", "INR"]),
  mode: z.enum(["test", "live"]),
  returnUrl: z.string().url(),
  webhookUrl: z.string().url(),
});

function sign(secret: string, message: string) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function verifyCodingFrontendEvent(
  secret: string,
  timestamp: string | undefined,
  raw: Buffer,
  signature: string | undefined,
) {
  if (!timestamp || !/^\d{10}$/.test(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300 ||
      !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(timestamp + ".").update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export async function codingFrontendCredentials(context: GatewayContext, interval: BillingInterval) {
  const [value, secret] = await Promise.all([
    getPaymentSetting("codingfrontend_origin", context),
    getPaymentSetting(codingFrontendSecretKey(interval), context),
  ]);
  if (!value || !secret || !/^[a-f0-9]{64}$/.test(secret))
    throw new Error("Set the CodingFrontend origin and the plan’s signing secret.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash ||
      (context.mode === "live" ? url.origin !== liveOrigin : url.origin === liveOrigin ||
        !(url.hostname.endsWith(".workers.dev") ||
          (url.hostname.endsWith(".codingfrontend.in") && url.hostname !== "www.codingfrontend.in"))))
    throw new Error("Use codingfrontend.in for live checkout and a test host under codingfrontend.in or workers.dev.");
  return { origin: url.origin, secret };
}

export async function fetchCodingFrontendPlan(
  context: GatewayContext,
  interval: BillingInterval,
  slug: string,
) {
  const credentials = await codingFrontendCredentials(context, interval);
  const url = new URL("/api/checkout/partner-plan", credentials.origin);
  url.searchParams.set("plan", slug);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(url, {
    headers: {
      "x-codingfrontend-timestamp": timestamp,
      "x-codingfrontend-signature": sign(credentials.secret, `plan.v1:${slug}:${timestamp}`),
    },
    redirect: "error",
    signal: AbortSignal.timeout(7500),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("CodingFrontend could not verify the signed plan. Check its slug, mode, and signing secret.");
  }
  const plan = hostedPlan.parse(await response.json());
  if (plan.slug !== slug || plan.mode !== context.mode)
    throw new Error("The CodingFrontend plan is configured for a different environment.");
  if (!apiEnv.AUTH_URL) throw new Error("Set AUTH_URL to your ActorConsole public origin.");
  const actorOrigin = new URL(apiEnv.AUTH_URL).origin;
  const expectedWebhook = new URL("/api/billing/webhooks/codingfrontend", actorOrigin);
  expectedWebhook.searchParams.set("mode", context.mode);
  const expectedReturn = new URL("/dashboard/settings/billing", actorOrigin);
  if (new URL(plan.webhookUrl).href !== expectedWebhook.href ||
      new URL(plan.returnUrl).href !== expectedReturn.href)
    throw new Error("Register the ActorConsole billing return URL and this mode’s webhook URL in CodingFrontend.");
  return { ...plan, ...credentials };
}

export function codingFrontendCheckoutLink(input: {
  id: string;
  origin: string;
  secret: string;
  slug: string;
  amount: number;
  currency: string;
  mode: string;
}) {
  const expiry = Math.floor(Date.now() / 1000) + 30 * 60;
  const token = `${input.id}.${expiry}.${input.amount}.${input.currency}.${input.mode}`;
  const url = new URL(`/checkout/${input.slug}`, input.origin);
  url.searchParams.set("token", `${token}.${sign(input.secret, `checkout.v1:${input.slug}:${token}`)}`);
  return url.href;
}

export function encryptCodingFrontendPrefill(secret: string, checkoutUrl: string, details: object) {
  const token = new URL(checkoutUrl).searchParams.get("token");
  if (!token) throw new Error("Checkout token is required for prefill.");
  const iv = randomBytes(12);
  const key = createHmac("sha256", secret).update("checkout-prefill:v1").digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(token));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(details), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
