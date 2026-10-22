/**
 * Newsletter / Blog Digest Email
 *
 * Sent to subscribers with a curated list of recent blog articles.
 * Each article card shows title, excerpt, and a read-more link.
 */

import type { NewsletterEmailProps } from "./types";
import { baseLayout, heading, paragraph, mutedText, divider, BRAND, FONT } from "./base";

export function renderNewsletterEmail(props: NewsletterEmailProps): string {
  const { appUrl, userName = "there", newsletterTitle, articles, unsubscribeUrl } = props;

  const articleCards = articles
    .map(
      (a) => `
      <tr>
        <td style="padding:0 0 20px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BRAND.bgAlt};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;">
                <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:${BRAND.text};font-family:${FONT};line-height:1.3;">
                  <a href="${escapeAttr(a.url)}" target="_blank" style="color:${BRAND.text};text-decoration:none;">${escapeHtml(a.title)}</a>
                </p>
                ${a.publishedAt ? `<p style="margin:0 0 10px;font-size:12px;color:${BRAND.muted};font-family:${FONT};">${escapeHtml(a.publishedAt)}</p>` : ""}
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.textSecondary};font-family:${FONT};">${escapeHtml(a.excerpt)}</p>
                <a href="${escapeAttr(a.url)}" target="_blank"
                   style="display:inline-block;font-size:14px;font-weight:600;color:${BRAND.primary};text-decoration:none;font-family:${FONT};">
                  Read more →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
    )
    .join("");

  return baseLayout({
    title: newsletterTitle,
    appUrl,
    body: `
      ${heading(`Hi ${userName},`)}

      ${paragraph(
        `Here's your latest digest from <strong>ActorConsole</strong>. We've curated the best articles to help you build better Apify actors.`,
      )}

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;">
        ${articleCards}
      </table>

      ${divider()}

      ${mutedText(
        `You're receiving this because you subscribed to the <strong>${escapeHtml(newsletterTitle)}</strong> newsletter. <a href="${escapeAttr(unsubscribeUrl ?? `${appUrl}/newsletter/unsubscribe`)}" style="color:${BRAND.primary};text-decoration:underline;">Unsubscribe</a>`,
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

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "%22");
}
