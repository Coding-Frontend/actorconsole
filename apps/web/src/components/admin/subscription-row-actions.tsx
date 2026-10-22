"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/action-dialog";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";

export function SubscriptionRowActions({
  subscriptionId,
  status,
}: {
  subscriptionId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (status === "cancelled") {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  async function cancel(reason: string) {
    setPending(true);
    const res = await api(`/admin/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const message = res.error.message ?? "Cancel failed";
      toast.error(message);
      setPending(false);
      throw new Error(message);
    }
    toast.success("Cancelled");
    router.refresh();
    setPending(false);
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setCancelOpen(true)}>
        <Ban className="h-4 w-4" />
        Cancel
      </Button>
      <PromptDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel subscription?"
        description="This records an audit reason and cancels the subscription."
        label="Reason"
        placeholder="Customer request"
        confirmLabel="Cancel subscription"
        onConfirm={cancel}
      />
    </>
  );
}
