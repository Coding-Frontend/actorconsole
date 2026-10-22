import { Hono } from "hono";
import { verifyResendSignature } from "@actorconsole/shared";
import { db } from "@actorconsole/db";
import { getIntegration } from "../lib/integrations.js";
import { AppError } from "../middleware/error.js";
import type { AppEnv } from "../app.js";

const MAX_WEBHOOK_BYTES = 1_048_576;

function parseWebhookJson(raw: string): Record<string, unknown> {
  if (Buffer.byteLength(raw, "utf8") > MAX_WEBHOOK_BYTES) {
    throw new AppError("payload_too_large", "Webhook payload exceeds 1 MiB", 413);
  }
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Expected an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new AppError("invalid_json", "Webhook payload must be valid JSON", 400);
  }
}

/** Signed inbound Resend delivery events. */
export const webhookRoutes = new Hono<AppEnv>().post("/resend", async (c) => {
  const raw = await c.req.text();
  const secret =
    (await getIntegration("resend_webhook_secret")) ?? process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppError(
      "misconfigured",
      "Resend webhook secret is required before delivery events can be consumed",
      503,
    );
  }
  const signatureOk = verifyResendSignature({
    body: raw,
    id: c.req.header("svix-id"),
    timestamp: c.req.header("svix-timestamp"),
    signature: c.req.header("svix-signature"),
    secret,
  });
  if (!signatureOk) throw new AppError("invalid_signature", "Bad Resend webhook signature", 401);

  const body = parseWebhookJson(raw) as {
    type?: string;
    data?: { email_id?: string; to?: string[] | string; email?: string };
  };
  const eventType = body.type ?? "unknown";
  const providerId = body.data?.email_id ?? c.req.header("svix-id") ?? null;
  const recipients = Array.isArray(body.data?.to)
    ? body.data?.to
    : body.data?.to
      ? [body.data.to]
      : body.data?.email
        ? [body.data.email]
        : [];
  const status =
    eventType.includes("bounced") || eventType.includes("complained")
      ? eventType.includes("complained")
        ? "complained"
        : "bounced"
      : eventType.includes("delivered")
        ? "delivered"
        : "event_received";

  if (providerId) {
    await db.emailLog.updateMany({
      where: { providerId },
      data: {
        status,
        eventType,
        error: status === "bounced" || status === "complained" ? eventType : null,
      },
    });
  }
  if (status === "bounced" || status === "complained") {
    for (const email of recipients) {
      await db.newsletterSubscriber.updateMany({
        where: { email: email.toLowerCase() },
        data: { status: "BOUNCED", unsubscribedAt: new Date() },
      });
    }
  }
  return c.json({ ok: true, data: { accepted: true, eventType, providerId } });
});
