import { redirect } from "next/navigation";
import { canRecoverMimicSession } from "@/lib/session-recovery";
import { MimicSessionRecovery } from "@/components/admin/mimic-session-recovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session recovery", robots: { index: false, follow: false } };

export default async function MimicEndedPage() {
  if (!(await canRecoverMimicSession())) redirect("/login");
  return <MimicSessionRecovery />;
}
