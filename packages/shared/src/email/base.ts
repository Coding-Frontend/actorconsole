/**
 * Base HTML email layout — ActorConsole brand design system.
 *
 * All transactional emails flow through `baseLayout()` which provides:
 *   - Responsive 600px max-width container
 *   - Brand gradient header with logo
 *   - Inter font stack
 *   - Consistent footer with unsubscribe / app link
 *
 * Colors extracted from `packages/config/tailwind/tailwind.config.ts`:
 *   brand-500: #5B3DF5  |  brand-600: #4A2CE0  |  brand-700: #3B23B3
 *   brand-400: #9563FF  |  accent-500: #F02E66
 */

// ---------------------------------------------------------------------------
// Brand tokens (static — no runtime deps so this works in Node without DOM)
// ---------------------------------------------------------------------------

const BRAND = {
  primary: "#5B3DF5",
  primaryDark: "#3B23B3",
  primaryLight: "#9563FF",
  gradient: "linear-gradient(135deg, #9563FF 0%, #5B3DF5 50%, #3B23B3 100%)",
  text: "#13141A",
  textSecondary: "#6C7080",
  muted: "#6C7080",
  bg: "#FFFFFF",
  bgAlt: "#F7F7F8",
  border: "#EEEFF2",
  white: "#FFFFFF",
} as const;

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export interface BaseLayoutOptions {
  /** Page <title> — also used as preview text fallback. */
  title: string;
  /** Inner HTML body content. */
  body: string;
  /** Absolute app URL for header/footer links. */
  appUrl: string;
}

/**
 * Wraps the given body HTML in a complete, responsive email document.
 */
export function baseLayout({ title, body, appUrl }: BaseLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <style>table,td{font-family:${FONT}!important}</style>
  <![endif]-->
  <style>
    /* Reset */
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0;mso-table-rspace:0}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
    body{margin:0;padding:0;width:100%!important;height:100%!important;background-color:${BRAND.bgAlt}}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important}

    /* Responsive */
    @media only screen and (max-width:620px){
      .email-container{width:100%!important;max-width:100%!important}
      .fluid{max-width:100%!important;height:auto!important}
      .stack-column,.stack-column-center{display:block!important;width:100%!important;max-width:100%!important}
      .center-on-narrow{text-align:center!important;display:block!important;margin-left:auto!important;margin-right:auto!important;float:none!important}
      .padding-mobile{padding-left:20px!important;padding-right:20px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgAlt};font-family:${FONT};color:${BRAND.text};">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(title)}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BRAND.bgAlt};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <!-- 600px container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="email-container" style="max-width:600px;width:100%;">

          <!-- ===== HEADER ===== -->
          <tr>
            <td style="padding:0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BRAND.gradient};border-radius:16px 16px 0 0;overflow:hidden;">
                <tr>
                  <td style="padding:32px 40px;text-align:center;" class="padding-mobile">
                    <!-- Logo -->
                    <a href="${appUrl}" target="_blank" style="text-decoration:none;">
                      <span style="font-size:24px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.white};font-family:${FONT};">
                        ◆ ActorConsole
                      </span>
                    </a>
                    <p style="margin:12px 0 0;font-size:14px;color:rgba(255,255,255,0.8);font-family:${FONT};">
                      ${escapeHtml(title)}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ===== BODY ===== -->
          <tr>
            <td style="background-color:${BRAND.bg};padding:40px;" class="padding-mobile">
              ${body}
            </td>
          </tr>

          <!-- ===== FOOTER ===== -->
          <tr>
            <td style="padding:0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BRAND.bgAlt};border-radius:0 0 16px 16px;border-top:1px solid ${BRAND.border};">
                <tr>
                  <td style="padding:28px 40px;text-align:center;" class="padding-mobile">
                    <p style="margin:0 0 8px;font-size:13px;color:${BRAND.muted};font-family:${FONT};">
                      ◆ ActorConsole &mdash; The DevOps platform for Apify Actor builders
                    </p>
                    <p style="margin:0 0 8px;font-size:12px;color:${BRAND.muted};font-family:${FONT};">
                      <a href="${appUrl}" target="_blank" style="color:${BRAND.primary};text-decoration:underline;">Open Dashboard</a>
                      &nbsp;&middot;&nbsp;
                      <a href="${appUrl}/settings/notifications" target="_blank" style="color:${BRAND.primary};text-decoration:underline;">Email Preferences</a>
                    </p>
                    <p style="margin:0;font-size:11px;color:#B6BAC4;font-family:${FONT};">
                      You received this because you have an account on ActorConsole.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Component-level helpers (inline, email-safe HTML snippets)
// ---------------------------------------------------------------------------

/** Primary CTA button — brand gradient background, white text, 16px radius. */
export function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto 0;">
    <tr>
      <td style="background:${BRAND.gradient};border-radius:12px;">
        <a href="${escapeHtml(href)}" target="_blank"
           style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${BRAND.white};text-decoration:none;font-family:${FONT};border-radius:12px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Large, centred OTP code block (Stripe-style monospace box). */
export function otpCodeBlock(code: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;">
    <tr>
      <td align="center">
        <div style="background:${BRAND.bgAlt};border:2px dashed ${BRAND.border};border-radius:12px;padding:20px 40px;display:inline-block;">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:${BRAND.primary};font-family:'Courier New',Courier,monospace;">
            ${escapeHtml(code)}
          </span>
        </div>
      </td>
    </tr>
  </table>`;
}

/** Muted helper text block. */
export function mutedText(text: string): string {
  return `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};font-family:${FONT};">${text}</p>`;
}

/** Heading inside email body (<h2> style). */
export function heading(text: string): string {
  return `<h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${BRAND.text};font-family:${FONT};line-height:1.3;">${escapeHtml(text)}</h2>`;
}

/** Body paragraph. */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BRAND.text};font-family:${FONT};">${text}</p>`;
}

/** Divider line. */
export function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${BRAND.border};margin:24px 0;" />`;
}

/** Info callout box. */
export function infoBox(text: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;">
    <tr>
      <td style="background-color:#F3F0FF;border-left:4px solid ${BRAND.primary};border-radius:8px;padding:14px 18px;">
        <p style="margin:0;font-size:14px;line-height:1.5;color:${BRAND.text};font-family:${FONT};">${text}</p>
      </td>
    </tr>
  </table>`;
}

// Re-export for template authors
export { BRAND, FONT };

/** Escape HTML entities — same as the API lib version but duplicated to
 *  avoid a cross-package import in the shared (template-only) module. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
