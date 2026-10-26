import { createHash } from "node:crypto";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../app.js";
import { apiEnv } from "../config/env.js";
import { escapeHtml, sendEmail, textToHtml } from "../lib/email.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { AppError } from "../middleware/error.js";
import { resolveClientIp } from "../lib/client-ip.js";

const contactSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(320),
    subject: z.enum(["support", "billing", "partnerships", "other"]),
    message: z.string().trim().min(10).max(10_000),
  })
  .strict();

const SUBJECT_LABELS: Record<z.infer<typeof contactSchema>["subject"], string> = {
  support: "Technical support",
  billing: "Billing",
  partnerships: "Partnerships",
  other: "General inquiry",
};

export const contactRoutes = new Hono<AppEnv>().post(
  "/",
  zValidator("json", contactSchema),
  async (c) => {
    const body = c.req.valid("json");
    const emailKey = createHash("sha256").update(body.email.toLowerCase()).digest("hex");
    const address = resolveClientIp(c);
    const [addressRate, emailRate] = await Promise.all([
      checkRateLimit(`contact:address:${address}`, { windowMs: 60 * 60 * 1000, max: 10 }),
      checkRateLimit(`contact:email:${emailKey}`, { windowMs: 60 * 60 * 1000, max: 3 }),
    ]);
    if (!addressRate.allowed || !emailRate.allowed) {
      throw new AppError(
        "rate_limited",
        "Too many contact requests. Please try again later.",
        429,
      );
    }

    if (!apiEnv.SUPPORT_EMAIL) {
      throw new AppError("contact_unavailable", "Contact delivery is not configured", 503);
    }

    const subjectLabel = SUBJECT_LABELS[body.subject];
    const result = await sendEmail({
      to: apiEnv.SUPPORT_EMAIL,
      replyTo: body.email,
      subject: `[ActorConsole contact] ${subjectLabel}`,
      text: `From: ${body.name} <${body.email}>\nSubject: ${subjectLabel}\n\n${body.message}`,
      html: [
        `<p><strong>From:</strong> ${escapeHtml(body.name)} &lt;${escapeHtml(body.email)}&gt;</p>`,
        `<p><strong>Subject:</strong> ${escapeHtml(subjectLabel)}</p>`,
        textToHtml(body.message),
      ].join("\n"),
    });
    if (!result.ok) {
      throw new AppError(
        "contact_delivery_failed",
        "Your message could not be delivered. Please try again later.",
        503,
      );
    }

    return c.json({ ok: true, data: { accepted: true } }, 202);
  },
);
