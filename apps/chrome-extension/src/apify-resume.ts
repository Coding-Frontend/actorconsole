export type ApifyResumeSession = { userId: string; uiToken: string };

export function parseResumeViewedUserId(value: unknown): string | null {
  try {
    const body = typeof value === "string" ? JSON.parse(value) as unknown : value;
    if (!body || typeof body !== "object") return null;
    const viewedUserId = (body as Record<string, unknown>).viewedUserId;
    return typeof viewedUserId === "string" && /^[A-Za-z0-9]{8,64}$/.test(viewedUserId)
      ? viewedUserId
      : null;
  } catch {
    return null;
  }
}

const RESUME_URL = "https://console-backend.apify.com/public/authentication/resume";

export function isApifyResumeUrl(input: unknown, baseUrl: string): boolean {
  const value = typeof input === "string" ? input : input instanceof URL ? input.href : null;
  if (!value) return false;
  try {
    const url = new URL(value, baseUrl);
    return url.origin + url.pathname === RESUME_URL;
  } catch {
    return false;
  }
}

export function parseApifyResumeSession(value: unknown): ApifyResumeSession | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const session = body.data && typeof body.data === "object" ? body.data : body;
  const record = session as Record<string, unknown>;
  if (
    typeof record.userId !== "string" ||
    !/^[A-Za-z0-9]{8,64}$/.test(record.userId) ||
    typeof record.uiToken !== "string" ||
    !/^apify_ui_[A-Za-z0-9_-]{12,8192}$/.test(record.uiToken)
  ) {
    return null;
  }
  return { userId: record.userId, uiToken: record.uiToken };
}
