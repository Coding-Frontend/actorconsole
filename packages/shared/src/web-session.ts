/** Public session data returned by the API. Credentials never cross this boundary. */
export interface WebSession {
  expires: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    plan: "FREE" | "PRO";
    role: "USER" | "ADMIN" | "SUPER_ADMIN";
    suspendedAt: string | null;
    deletionScheduledFor: string | null;
  };
  mimic: { user: { id: string; email: string; name: string | null }; expiresAt: string } | null;
}
