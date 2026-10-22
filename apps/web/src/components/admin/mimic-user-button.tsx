"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function MimicUserButton({
  user,
  workspaceId,
  dashboardPath = "/dashboard",
  label = "Mimic this user",
}: {
  user: {
    id: string;
    role: string;
    suspendedAt: string | null;
    deletionScheduledFor?: string | null;
  };
  workspaceId?: string;
  dashboardPath?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const unavailable =
    user.role !== "USER" || Boolean(user.suspendedAt || user.deletionScheduledFor);

  async function start() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, workspaceId, dashboardPath }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok)
        throw new Error(body.error ?? "Could not open this user's dashboard");
      window.location.assign(body.data.redirectTo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open this user's dashboard");
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy || unavailable}
      onClick={() => void start()}
      title={
        unavailable
          ? "Mimic access requires an active user account with no pending deletion."
          : undefined
      }
    >
      <Eye className="h-4 w-4" /> {busy ? "Opening dashboard…" : label}
    </Button>
  );
}
