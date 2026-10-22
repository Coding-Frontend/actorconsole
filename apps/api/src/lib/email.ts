/**
 * Best-effort transactional email via the admin-selected provider.
 *
 * Reads `resend_api_key` and `email_from_address` from the integrations
 * catalog (DB or env) — never throws. Use as `void sendEmail(...)` so a
 * mail-provider outage never 5xx's the user.
 */

import { getIntegration } from "./integrations";
import { db } from "@actorconsole/db";
import { getLogger } from "@actorconsole/shared";
import nodemailer, { type Transporter } from "nodemailer";

const log = getLogger("api:email");

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; reason: "missing_config" | "send_failed" };

let resendClient: any | null = null;
let resendClientKey: string | null = null;
let smtpClient: Transporter | null = null;
let smtpClientKey: string | null = null;

function normalizeEmailAddress(value: string): string | null {
  const candidate = value.trim();
  const match = candidate.match(/^(?:[^<>\r\n]+\s*)?<([^<>\s]+)>$|^([^<>\s]+)$/);
  const email = match?.[1] ?? match?.[2];
  if (!email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return candidate;
}

async function logEmail(data: {
  to: string;
  subject: string;
  status: string;
  providerId?: string | null;
  eventType?: string | null;
  error?: string | null;
}) {
  await db.emailLog
    .create({ data })
    .catch((err) => log.warn({ err }, "Could not persist email delivery log"));
}

async function getResendClient(): Promise<any | null> {
  const apiKey = await getIntegration("resend_api_key").catch(() => null);
  if (!apiKey) return null;
  if (resendClient && resendClientKey === apiKey) return resendClient;
  const { Resend } = await import("resend").catch(() => ({ Resend: null as any }));
  if (!Resend) return null;
  resendClient = new Resend(apiKey);
  resendClientKey = apiKey;
  return resendClient;
}

async function getSmtpClient(): Promise<Transporter | null> {
  const [host, portValue, secureValue, username, password] = await Promise.all([
    getIntegration("smtp_host"),
    getIntegration("smtp_port"),
    getIntegration("smtp_secure"),
    getIntegration("smtp_username"),
    getIntegration("smtp_password"),
  ]);
  if (!host || Boolean(username) !== Boolean(password)) return null;
  const port = Number(portValue || "587");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  const secure = secureValue === "true";
  const cacheKey = JSON.stringify([host, port, secure, username, password]);
  if (smtpClient && smtpClientKey === cacheKey) return smtpClient;
  smtpClient = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: username && password ? { user: username, pass: password } : undefined,
  });
  smtpClientKey = cacheKey;
  return smtpClient;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).map((value) => value.trim());
  const logTarget = recipients.join(", ").slice(0, 500);
  try {
    const from = await getIntegration("email_from_address").catch(() => null);
    if (!from) {
      await logEmail({
        to: logTarget,
        subject: input.subject,
        status: "failed",
        error: "email_from_address not configured",
      });
      return { ok: false, error: "email_from_address not configured", reason: "missing_config" };
    }
    if (!normalizeEmailAddress(from) || recipients.some((value) => !normalizeEmailAddress(value))) {
      const error = "Email sender or recipient address is invalid";
      await logEmail({ to: logTarget, subject: input.subject, status: "failed", error });
      return { ok: false, error, reason: "send_failed" };
    }

    const provider = (await getIntegration("email_provider"))?.trim().toLowerCase() || "resend";
    if (provider === "smtp") {
      const client = await getSmtpClient();
      if (!client) {
        const error = "SMTP integration is not fully configured";
        await logEmail({ to: logTarget, subject: input.subject, status: "failed", error });
        return { ok: false, error, reason: "missing_config" };
      }
      const result = await client.sendMail({
        from,
        to: recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
      });
      await logEmail({
        to: logTarget,
        subject: input.subject,
        status: "sent",
        providerId: result.messageId,
      });
      return { ok: true, id: result.messageId };
    }

    const client = await getResendClient();
    if (!client) {
      await logEmail({
        to: logTarget,
        subject: input.subject,
        status: "failed",
        error: "resend_api_key not configured",
      });
      return { ok: false, error: "resend_api_key not configured", reason: "missing_config" };
    }

    const res = await client.emails.send({
      from,
      to: recipients,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    if (res?.error) {
      const error = String(res.error?.message ?? res.error);
      await logEmail({ to: logTarget, subject: input.subject, status: "failed", error });
      return { ok: false, error, reason: "send_failed" };
    }
    await logEmail({
      to: logTarget,
      subject: input.subject,
      status: "sent",
      providerId: res?.data?.id ?? null,
    });
    return { ok: true, id: res?.data?.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await logEmail({ to: logTarget, subject: input.subject, status: "failed", error });
    return {
      ok: false,
      error,
      reason: "send_failed",
    };
  }
}

/** Tiny HTML escape so we can render user-supplied text in transactional emails. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain-text → minimal HTML (paragraphs + line breaks). */
export function textToHtml(s: string): string {
  return escapeHtml(s)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Template-based email senders
//
// These combine the branded HTML templates from @actorconsole/shared with the
// best-effort sendEmail() transport.  They all follow the fire-and-forget
// pattern — never throw on mail-provider errors.
// ---------------------------------------------------------------------------

import {
  renderOtpEmail,
  renderResetPasswordEmail,
  renderWelcomeEmail,
  renderTicketReplyEmail,
  renderNewsletterEmail,
  getAppBaseUrl,
} from "@actorconsole/shared";
import type {
  OtpEmailProps,
  ResetPasswordEmailProps,
  WelcomeEmailProps,
  TicketReplyEmailProps,
  NewsletterEmailProps,
} from "@actorconsole/shared";

/** Resolved app URL — falls back to AUTH_URL env or localhost. */
function getAppUrl(): string {
  return getAppBaseUrl();
}

/** Send an OTP verification email. */
export async function sendOtpEmail(
  to: string,
  props: Omit<OtpEmailProps, "appUrl">,
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: "Your ActorConsole verification code",
    html: renderOtpEmail({ ...props, appUrl: getAppUrl() }),
  });
}

/** Send a password-reset OTP email. */
export async function sendResetPasswordEmail(
  to: string,
  props: Omit<ResetPasswordEmailProps, "appUrl">,
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: "Reset your ActorConsole password",
    html: renderResetPasswordEmail({ ...props, appUrl: getAppUrl() }),
  });
}

/** Send a welcome email after signup. */
export async function sendWelcomeEmail(
  to: string,
  props: Omit<WelcomeEmailProps, "appUrl">,
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: "Welcome to ActorConsole! 🎉",
    html: renderWelcomeEmail({ ...props, appUrl: getAppUrl() }),
  });
}

/** Send a ticket-reply notification email. */
export async function sendTicketReplyEmail(
  to: string,
  props: Omit<TicketReplyEmailProps, "appUrl">,
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: `[AL-${props.ticketNumber}] ${props.ticketSubject} — new reply`,
    html: renderTicketReplyEmail({ ...props, appUrl: getAppUrl() }),
  });
}

/** Send a newsletter / blog digest email. */
export async function sendNewsletterEmail(
  to: string,
  props: Omit<NewsletterEmailProps, "appUrl">,
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: props.newsletterTitle,
    html: renderNewsletterEmail({ ...props, appUrl: getAppUrl() }),
  });
}
