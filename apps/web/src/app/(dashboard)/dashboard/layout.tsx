import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DeletionPendingScreen } from "@/components/dashboard/deletion-pending-screen";
import { OnboardingGate } from "@/components/dashboard/onboarding-gate";
import { getMimicStatus } from "@/lib/impersonation";
import { canRecoverMimicSession } from "@/lib/session-recovery";
import { getServerWorkspaceAccess } from "@/lib/server-workspace-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    if (await canRecoverMimicSession()) redirect("/mimic-ended");
    redirect("/login?callbackUrl=/dashboard");
  }
  const mimicStatus = await getMimicStatus();

  const user = session.user;
  if (!user) redirect("/login?error=session_expired");
  if (user.suspendedAt && !user.deletionScheduledFor) redirect("/login?error=account_suspended");

  return (
    <DashboardShell
      skipWorkspaceAccess={Boolean(user.deletionScheduledFor)}
      mimicStatus={mimicStatus}
      initialAccess={user.deletionScheduledFor ? null : await getServerWorkspaceAccess()}
    >
      {user.deletionScheduledFor ? (
        <DeletionPendingScreen scheduledFor={user.deletionScheduledFor} />
      ) : (
        <OnboardingGate>{children}</OnboardingGate>
      )}
    </DashboardShell>
  );
}
