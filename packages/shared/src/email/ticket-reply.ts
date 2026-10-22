/**
 * Support Ticket Reply Notification Email
 *
 * Sent to the ticket author when a support agent (or admin) replies.
 * Shows the reply body in a styled blockquote with a link to the ticket.
 */

import type { TicketReplyEmailProps } from "./types";
import { baseLayout, heading, paragraph, ctaButton, mutedText, BRAND, FONT } from "./base";

export function renderTicketReplyEmail(props: TicketReplyEmailProps): string {
  const { appUrl, userName = "there", ticketNumber, ticketSubject, fromName, replyBody } = props;
  const ticketUrl = `${appUrl}/dashboard/tickets/${ticketNumber}`;

  return baseLayout({
    title: `Reply on AL-${ticketNumber}`,
    appUrl,
    body: `
      ${heading(`Hi ${userName},`)}

      ${paragraph(
        `<strong>${escapeHtml(fromName)}</strong> replied to your support ticket <strong>AL-${ticketNumber}</strong>:`,
      )}

      <!-- Ticket subject badge -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 16px;">
        <tr>
          <td>
            <span style="display:inline-block;background:#F3F0FF;color:${BRAND.primary};font-size:13px;font-weight:600;padding:4px 12px;border-radius:20px;font-family:${FONT};">
              AL-${ticketNumber} &middot; ${escapeHtml(ticketSubject)}
            </span>
          </td>
        </tr>
      </table>

      <!-- Reply blockquote -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
        <tr>
          <td style="border-left:4px solid ${BRAND.primaryLight};padding:16px 20px;background:${BRAND.bgAlt};border-radius:0 8px 8px 0;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.text};font-family:${FONT};white-space:pre-wrap;">${escapeHtml(replyBody)}</p>
          </td>
        </tr>
      </table>

      ${ctaButton(ticketUrl, "View Ticket")}

      ${mutedText(
        "This is a notification about your support ticket. You will be notified when there are new replies.",
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
