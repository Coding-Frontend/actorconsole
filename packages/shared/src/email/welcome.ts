/**
 * Welcome Email
 *
 * Sent after successful signup. Introduces the platform, highlights key
 * features, and provides a primary CTA to the dashboard.
 */

import type { WelcomeEmailProps } from "./types";
import { baseLayout, heading, paragraph, ctaButton, mutedText, divider, BRAND, FONT } from "./base";

export function renderWelcomeEmail(props: WelcomeEmailProps): string {
  const { appUrl, userName = "there" } = props;

  const features = [
    {
      icon: "🚀",
      title: "AI-Powered Store Optimization",
      desc: "Rewrite actor titles, descriptions, and SEO metadata to rank higher on the Apify Store.",
    },
    {
      icon: "🌐",
      title: "Website Logo Catalog",
      desc: "Keep Actor listings recognizable with reviewed website and service logos.",
    },
    {
      icon: "📅",
      title: "Publishing Schedules",
      desc: "Publish ordered Actor queues safely within Apify's daily limits.",
    },
    {
      icon: "📊",
      title: "Usage-Cost Analytics",
      desc: "Understand Apify platform costs and run activity across your tracked Actors.",
    },
  ];

  return baseLayout({
    title: "Welcome to ActorConsole",
    appUrl,
    body: `
      ${heading(`Welcome aboard, ${userName}! 🎉`)}

      ${paragraph(
        `You've joined <strong>ActorConsole</strong>, an operations workspace for Apify Actor developers. Use it to manage actors, Store content, publishing queues, and usage costs.`,
      )}

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;">
        <tr>
          <td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BRAND.bgAlt};border-radius:12px;border:1px solid ${BRAND.border};">
              ${features
                .map(
                  (f) => `
              <tr>
                <td style="padding:18px 24px;vertical-align:top;width:48px;font-size:24px;">
                  ${f.icon}
                </td>
                <td style="padding:18px 24px 18px 0;vertical-align:top;">
                  <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:${BRAND.text};font-family:${FONT};">${f.title}</p>
                  <p style="margin:0;font-size:14px;line-height:1.5;color:${BRAND.textSecondary};font-family:${FONT};">${f.desc}</p>
                </td>
              </tr>`,
                )
                .join("")}
            </table>
          </td>
        </tr>
      </table>

      ${ctaButton(appUrl, "Go to Dashboard →")}

      ${mutedText(
        "Create a workspace and connect the Apify credentials needed for your workflow to get started.",
      )}

      ${divider()}

      ${paragraph(
        `If you have any questions, reply to this email or visit our <a href="${appUrl}/docs" style="color:${BRAND.primary};text-decoration:underline;">documentation</a>.`,
      )}
    `,
  });
}
