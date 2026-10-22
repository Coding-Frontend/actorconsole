export const AUTH_SESSION_COOKIE_NAME = "authjs.session-token";
export const SECURE_AUTH_SESSION_COOKIE_NAME = "__Secure-authjs.session-token";

function configuredAuthUrl(): URL | null {
  const value = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Preserve existing session cookie names while the API owns their lifecycle.
 * HTTPS deployments use a secure, host-only cookie forwarded by the web proxy.
 */
export function usesSecureAuthSessionCookie(req?: Request): boolean {
  const authUrl = configuredAuthUrl();
  if (authUrl) return authUrl.protocol === "https:";

  const forwardedProtocol = req?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProtocol) return forwardedProtocol === "https";

  const forwardedSsl = req?.headers.get("x-forwarded-ssl")?.trim().toLowerCase();
  if (forwardedSsl) return forwardedSsl === "on";

  if (req?.url) {
    try {
      return new URL(req.url).protocol === "https:";
    } catch {
      // Fall back to the production default below when the request URL is
      // unavailable or malformed.
    }
  }

  return process.env.NODE_ENV === "production";
}

export function getAuthSessionCookieName(req?: Request): string {
  return usesSecureAuthSessionCookie(req)
    ? SECURE_AUTH_SESSION_COOKIE_NAME
    : AUTH_SESSION_COOKIE_NAME;
}

export function getAuthSessionCookieOptions(req?: Request) {
  return {
    httpOnly: true,
    secure: usesSecureAuthSessionCookie(req),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  };
}
