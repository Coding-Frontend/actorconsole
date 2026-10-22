/** Keep post-auth navigation on this origin and out of auth loops. */
export function safeCallbackUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }
  if (/^\/(?:login|signup)(?:[/?#]|$)/i.test(value)) return "/dashboard";
  return value;
}
