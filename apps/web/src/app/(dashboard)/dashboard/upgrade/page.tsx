"use client";
import { useWorkspaceAccess } from "@/components/dashboard/workspace-access-context";
import { WorkspaceUpgradeScreen } from "@/components/dashboard/workspace-upgrade-screen";

export default function WorkspaceUpgradePage() {
  const { access, loading, error, refresh } = useWorkspaceAccess();
  if (loading && !access) return <p role="status">Checking workspace access…</p>;
  return <WorkspaceUpgradeScreen access={access} error={error} refresh={refresh} />;
}
