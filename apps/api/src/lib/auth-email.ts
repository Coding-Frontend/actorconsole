import nodemailer from "nodemailer";
import { Resend } from "resend";
import { db, getIntegration } from "@actorconsole/db";
import {
  getAppBaseUrl,
  getLogger,
  renderOtpEmail,
  renderResetPasswordEmail,
} from "@actorconsole/shared";

const log = getLogger("api:auth-email");

type DeliveryResult = { ok: true } | { ok: false; error: string };

async function recordDelivery(to: string, subject: string, result: DeliveryResult) {
  await db.emailLog
    .create({
      data: {
        to: to.slice(0, 500),
        subject,
        template: "authentication",
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
      },
    })
    .catch((error) => log.warn({ error }, "Could not record authentication email"));
}

async function sendAuthEmail(to: string, subject: string, html: string): Promise<DeliveryResult> {
  try {
    const from = await getIntegration("email_from_address");
    if (!from) {
      const result = { ok: false as const, error: "Authentication email sender is not configured" };
      await recordDelivery(to, subject, result);
      return result;
    }

    const provider = (await getIntegration("email_provider"))?.trim().toLowerCase() || "resend";
    if (provider === "smtp") {
      const [host, portValue, secureValue, username, password] = await Promise.all([
        getIntegration("smtp_host"),
        getIntegration("smtp_port"),
        getIntegration("smtp_secure"),
        getIntegration("smtp_username"),
        getIntegration("smtp_password"),
      ]);
      if (!host || Boolean(username) !== Boolean(password)) {
        const result = { ok: false as const, error: "SMTP authentication email is not configured" };
        await recordDelivery(to, subject, result);
        return result;
      }
      const transporter = nodemailer.createTransport({
        host,
        port: Number(portValue || "587"),
        secure: secureValue === "true",
        auth: username && password ? { user: username, pass: password } : undefined,
      });
      await transporter.sendMail({ from, to, subject, html });
    } else {
      const apiKey = await getIntegration("resend_api_key");
      if (!apiKey) {
        const result = {
          ok: false as const,
          error: "Resend authentication email is not configured",
        };
        await recordDelivery(to, subject, result);
        return result;
      }
      const response = await new Resend(apiKey).emails.send({ from, to, subject, html });
      if (response.error) throw new Error(response.error.message);
    }

    const result = { ok: true as const };
    await recordDelivery(to, subject, result);
    return result;
  } catch (error) {
    const result = {
      ok: false as const,
      error: error instanceof Error ? error.message : "Authentication email could not be sent",
    };
    await recordDelivery(to, subject, result);
    return result;
  }
}

export function sendVerificationCode(to: string, userName: string | null, code: string) {
  return sendAuthEmail(
    to,
    "Verify your ActorConsole email",
    renderOtpEmail({
      appUrl: getAppBaseUrl(),
      userName: userName ?? undefined,
      otp: code,
      purpose: "verify your email address",
      expiresInMinutes: 10,
    }),
  );
}

export function sendPasswordResetCode(to: string, userName: string | null, code: string) {
  return sendAuthEmail(
    to,
    "Reset your ActorConsole password",
    renderResetPasswordEmail({
      appUrl: getAppBaseUrl(),
      userName: userName ?? undefined,
      otp: code,
      expiresInMinutes: 10,
    }),
  );
}
