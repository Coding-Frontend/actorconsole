/**
 * @actorconsole/shared — Email templates
 *
 * All transactional email renderers for ActorConsole.
 * Import from `@actorconsole/shared` (re-exported via `index.ts`).
 *
 * Usage:
 * ```ts
 * import { renderOtpEmail } from "@actorconsole/shared";
 * const html = renderOtpEmail({ appUrl, otp: "123456", purpose: "verify your email" });
 * await sendEmail({ to: user.email, subject: "Your code", html });
 * ```
 */

// Base layout & reusable components
export {
  baseLayout,
  ctaButton,
  otpCodeBlock,
  mutedText,
  heading,
  paragraph,
  divider,
  infoBox,
  BRAND,
  FONT,
} from "./base";

// Individual templates
export { renderOtpEmail } from "./otp";
export { renderResetPasswordEmail } from "./reset-password";
export { renderWelcomeEmail } from "./welcome";
export { renderNewsletterEmail } from "./newsletter";
export { renderTicketReplyEmail } from "./ticket-reply";

// Types
export type {
  EmailBaseProps,
  OtpEmailProps,
  ResetPasswordEmailProps,
  WelcomeEmailProps,
  NewsletterEmailProps,
  TicketReplyEmailProps,
} from "./types";
