import "server-only";
import { auth } from "./auth";
export interface MimicStatus {
  user: { id: string; name: string | null; email: string };
  expiresAt: string;
}
export async function getMimicStatus(): Promise<MimicStatus | null> {
  return (await auth())?.mimic ?? null;
}
