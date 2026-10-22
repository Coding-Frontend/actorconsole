"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, ShieldAlert, ShieldCheck, UserCog, Trash2 } from "lucide-react";
import { MimicUserButton } from "./mimic-user-button";
import { api } from "@/lib/admin/api";
import { useRouter } from "next/navigation";

interface Props {
  user: {
    id: string;
    email: string;
    role: string;
    suspendedAt: string | null;
    deletionScheduledFor?: string | null;
    businessProfiles: Array<{ id: string; name: string; plan: "FREE" | "PRO" }>;
  };
  canUseSuperAdminActions: boolean;
}

export function UserActions({ user, canUseSuperAdminActions }: Props) {
  const router = useRouter();
  const [grantDays, setGrantDays] = useState(365);
  const [workspacePlans, setWorkspacePlans] = useState<Record<string, "FREE" | "PRO">>(() =>
    Object.fromEntries(user.businessProfiles.map((workspace) => [workspace.id, workspace.plan])),
  );
  const [reinstateOpen, setReinstateOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [planTargetId, setPlanTargetId] = useState<string | null>(null);
  const validGrantDays = Number.isInteger(grantDays) && grantDays >= 1 && grantDays <= 3650;
  const planTarget = user.businessProfiles.find((workspace) => workspace.id === planTargetId);

  async function reinstateUser() {
    const response = await api(`/admin/users/${user.id}/reinstate`, { method: "POST" });
    if (!response.ok) {
      const message = response.error.message ?? "Failed to reinstate user";
      toast.error(message);
      throw new Error(message);
    }
    toast.success("User reinstated");
    router.refresh();
  }

  async function assignPlan() {
    const workspace = user.businessProfiles.find((candidate) => candidate.id === planTargetId);
    if (!workspace || !validGrantDays) throw new Error("Select a valid workspace plan assignment");
    const response = await api(`/admin/business-profiles/${workspace.id}/plan`, {
      method: "PATCH",
      body: JSON.stringify({
        plan: workspacePlans[workspace.id] ?? workspace.plan,
        days: grantDays,
      }),
    });
    if (!response.ok) {
      const message = response.error.message ?? "Failed to update workspace plan";
      toast.error(message);
      throw new Error(message);
    }
    toast.success(`${workspace.name} plan updated`);
    router.refresh();
  }

  async function suspendUser() {
    const response = await api(`/admin/users/${user.id}/suspend`, { method: "POST" });
    if (!response.ok) {
      const message = response.error.message ?? "Failed to suspend user";
      toast.error(message);
      throw new Error(message);
    }
    toast.success("User suspended");
    router.refresh();
  }

  async function deleteUser() {
    const response = await api(
      `/admin/users/${user.id}?confirm=${encodeURIComponent(user.email)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const message = response.error.message ?? "Failed to delete user";
      toast.error(message);
      throw new Error(message);
    }
    toast.success("User deleted");
    router.push("/admin/users");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Support access</CardTitle>
        </CardHeader>
        <CardContent>
          <MimicUserButton user={user} />
          <p className="text-muted-foreground mt-2 text-xs">
            15-minute maximum; start and exit are audited.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suspend / Reinstate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {user.suspendedAt ? (
            <Button variant="outline" size="sm" onClick={() => setReinstateOpen(true)}>
              <ShieldCheck className="h-4 w-4" />
              Reinstate user
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setSuspendOpen(true)}>
              <ShieldAlert className="h-4 w-4" />
              Suspend user
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace plans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="grant-days">Access days</Label>
          <div className="flex gap-2 border-b pb-3">
            <Input
              id="grant-days"
              type="number"
              min={1}
              max={3650}
              value={grantDays}
              onChange={(e) => setGrantDays(Number(e.target.value))}
              className="w-20"
            />
            <p className="text-muted-foreground self-center text-xs">
              Applied to paid manual assignments.
            </p>
          </div>
          {!validGrantDays ? (
            <p role="alert" className="text-destructive text-xs">
              Access days must be a whole number between 1 and 3650.
            </p>
          ) : null}
          {user.businessProfiles.map((workspace) => (
            <div key={workspace.id} className="space-y-2 border-b pb-3 last:border-0 last:pb-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4" /> {workspace.name}
              </div>
              <div className="flex gap-2">
                <select
                  value={workspacePlans[workspace.id] ?? workspace.plan}
                  onChange={(event) =>
                    setWorkspacePlans((current) => ({
                      ...current,
                      [workspace.id]: event.target.value as "FREE" | "PRO",
                    }))
                  }
                  className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
                  aria-label={`Plan for ${workspace.name}`}
                >
                  <option value="FREE">Free</option>
                  <option value="PRO">Pro</option>
                </select>
                <Button
                  size="sm"
                  disabled={!validGrantDays}
                  aria-label={`Assign plan for ${workspace.name}`}
                  onClick={() => setPlanTargetId(workspace.id)}
                >
                  <UserCog className="h-4 w-4" /> Assign
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {canUseSuperAdminActions ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete user
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground rounded-md border p-3 text-xs">
          Permanent deletion requires a super-admin account.
        </p>
      )}
      <ConfirmDialog
        open={reinstateOpen}
        onOpenChange={setReinstateOpen}
        title="Reinstate this user?"
        description="The user will regain access to ActorConsole immediately."
        confirmLabel="Reinstate user"
        onConfirm={reinstateUser}
      />
      <ConfirmDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title="Suspend this user?"
        description="The user will lose access until an administrator reinstates the account."
        confirmLabel="Suspend user"
        destructive
        onConfirm={suspendUser}
      />
      <ConfirmDialog
        open={Boolean(planTargetId)}
        onOpenChange={(open) => {
          if (!open) setPlanTargetId(null);
        }}
        title="Assign this workspace plan?"
        description={
          planTarget
            ? `${planTarget.name} will receive ${workspacePlans[planTarget.id] ?? planTarget.plan} access for ${grantDays} days.`
            : "Confirm the selected workspace plan assignment."
        }
        confirmLabel="Assign plan"
        onConfirm={assignPlan}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this user permanently?"
        description="This permanently deletes the user and all associated data. This action cannot be undone."
        confirmLabel="Delete user"
        destructive
        onConfirm={deleteUser}
      />
    </div>
  );
}
