/**
 * Reset Password OTP Email
 *
 * Sent when a user requests a password reset. Shows a 6-digit OTP code
 * with a prominent warning about account security.
 */

import type { ResetPasswordEmailProps } from "./types";
import { baseLayout, heading, paragraph, otpCodeBlock, mutedText, infoBox, divider } from "./base";

export function renderResetPasswordEmail(props: ResetPasswordEmailProps): string {
  const { appUrl, userName = "there", otp, expiresInMinutes = 10 } = props;

  return baseLayout({
    title: "Reset your password",
    appUrl,
    body: `
      ${heading(`Hi ${userName},`)}

      ${paragraph("We received a request to reset the password for your ActorConsole account.")}

      ${otpCodeBlock(otp)}

      ${mutedText(`This code expires in <strong>${expiresInMinutes} minutes</strong>.`)}

      ${divider()}

      ${infoBox(
        "🔒 <strong>Didn't request this?</strong> Your account is still secure. You can safely ignore this email — no changes have been made. Consider enabling two-factor authentication for extra protection.",
      )}
    `,
  });
}
