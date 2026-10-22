import { authenticatedServerFetch } from "./server-api";

export async function canRecoverMimicSession() {
  const response = await authenticatedServerFetch("/auth/session-recovery");
  if (!response.ok) throw new Error("Session recovery is unavailable");
  const body = await response.json();
  return body.available === true;
}
