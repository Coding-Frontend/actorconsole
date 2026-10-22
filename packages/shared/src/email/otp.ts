/**
 * OTP Verification Email
 *
 * Sent when a user needs to verify their email address (signup, email change,
 * sensitive action confirmation). Displays a large, styled 6-digit OTP code.
 */

import type { OtpEmailProps } from "./types";
import { baseLayout, heading, paragraph, otpCodeBlock, mutedText, infoBox } from "./base";

export function renderOtpEmail(props: OtpEmailProps): string {
  const { appUrl, userName = "there", otp, purpose, expiresInMinutes = 10 } = props;

  return baseLayout({
    title: "Your verification code",
    appUrl,
    body: `
      ${heading(`Hi ${userName},`)}

      ${paragraph(`You requested a verification code to <strong>${escapeHtml(purpose)}</strong>.`)}

      ${otpCodeBlock(otp)}

      ${mutedText(
        `This code expires in <strong>${expiresInMinutes} minutes</strong>. If you didn't request this, you can safely ignore this email.`,
      )}

      ${infoBox(
        "💡 <strong>Tip:</strong> Never share this code with anyone. ActorConsole staff will never ask for your OTP.",
      )}
    `,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
