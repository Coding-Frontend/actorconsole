/**
 * Email template types for ActorConsole transactional emails.
 */

/** Base props shared by every email template. */
export interface EmailBaseProps {
  /** Absolute URL to the ActorConsole app (e.g. https://app.example.com). */
  appUrl: string;
  /** User's display name or "there" as fallback. */
  userName?: string;
}

/** OTP / verification code email. */
export interface OtpEmailProps extends EmailBaseProps {
  /** The numeric OTP code to display. */
  otp: string;
  /** Short description of why the OTP was sent (e.g. "verify your email"). */
  purpose: string;
  /** Minutes until the OTP expires. */
  expiresInMinutes?: number;
}

/** Password-reset OTP email. */
export interface ResetPasswordEmailProps extends EmailBaseProps {
  /** The numeric OTP code. */
  otp: string;
  /** Minutes until expiry. */
  expiresInMinutes?: number;
}

/** Welcome email sent after successful signup. */
export interface WelcomeEmailProps extends EmailBaseProps {
  /** The user's email (used for the CTA link context). */
  email: string;
}

/** Newsletter / blog digest email. */
export interface NewsletterEmailProps extends EmailBaseProps {
  /** Newsletter title / subject. */
  newsletterTitle: string;
  /** Recipient-specific one-click unsubscribe URL. */
  unsubscribeUrl?: string;
  /** Array of blog items to render. */
  articles: Array<{
    title: string;
    url: string;
    excerpt: string;
    publishedAt?: string;
  }>;
}

/** Support ticket notification (new reply). */
export interface TicketReplyEmailProps extends EmailBaseProps {
  ticketNumber: number;
  ticketSubject: string;
  fromName: string;
  replyBody: string;
}
