"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { AlertTriangle, Loader2 } from "lucide-react";

const API_BASE = API_BASE_URL;

export default function DeleteAccountPage() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [cancelling, startCancel] = useTransition();
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    fetch(`${API_BASE}/account/deletion`, { credentials: "include" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.ok) {
          throw new Error(body?.error?.message ?? "Could not load deletion status");
        }
        setScheduledFor(body.data?.deletionScheduledFor ?? null);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Could not load deletion status"),
      )
      .finally(() => setLoadingStatus(false));
  }, []);

  function handleDelete() {
    if (confirm !== "DELETE") {
      toast.error('Type "DELETE" to confirm');
      return;
    }
    startDelete(async () => {
      try {
        const res = await fetch(`${API_BASE}/account`, {
          method: "DELETE",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation: confirm }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          throw new Error(body?.error?.message ?? "Account closure failed");
        }
        setScheduledFor(body.data.deletionScheduledFor);
        setConfirm("");
        toast.success("Account deletion scheduled. You can cancel it during the grace period.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Deletion failed");
      }
    });
  }

  function cancelDeletion() {
    startCancel(async () => {
      try {
        const res = await fetch(`${API_BASE}/account/deletion/cancel`, {
          method: "POST",
          credentials: "include",
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          throw new Error(body?.error?.message ?? "Could not cancel deletion");
        }
        setScheduledFor(null);
        toast.success("Account deletion cancelled");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not cancel deletion");
      }
    });
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        context="Account / Danger zone"
        title="Delete account"
        description="Schedule permanent account removal and revoke active access."
        breadcrumbs={[{ label: "Account" }, { label: "Account deletion" }]}
      />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Account closure
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            This suspends access and schedules permanent removal after a 30-day grace period.
            Operational and financial records are retained in de-identified form where required for
            integrity and compliance. Your actors on the Apify Store are not changed.
          </p>
          {loadingStatus ? null : scheduledFor ? (
            <div className="border-signal-orange/40 bg-signal-orange/5 rounded-md border p-4">
              <p className="text-sm font-medium">Deletion is scheduled</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Your workspace will be permanently removed on{" "}
                {new Date(scheduledFor).toLocaleString()}.
              </p>
              <Button
                className="mt-3"
                variant="outline"
                onClick={cancelDeletion}
                disabled={cancelling}
              >
                {cancelling && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Cancel deletion
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="confirm">
              Type <strong>DELETE</strong> to confirm
            </Label>
            <Input
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type DELETE here"
              className="border-destructive/50"
            />
          </div>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || cancelling || Boolean(scheduledFor) || confirm !== "DELETE"}
          >
            {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Close my account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
