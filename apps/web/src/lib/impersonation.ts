import "server-only";
import { auth } from "./auth";
export const ORIGINAL_SESSION_COOKIE = "actorconsole.original-session";
export const ORIGINAL_WORKSPACE_COOKIE = "actorconsole.original-workspace";
export const WORKSPACE_COOKIE = "actorconsole.business-profile";
export interface MimicStatus {
  user: { id: string; name: string | null; email: string };
  expiresAt: string;
}
export async function getMimicStatus(): Promise<MimicStatus | null> {
  return (await auth())?.mimic ?? null;
}
