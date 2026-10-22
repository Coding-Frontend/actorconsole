"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { Textarea } from "@/components/ui/input";

const STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;

export function IncidentUpdateForm({ id, currentStatus }: { id: string; currentStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function submit() {
    const response = await api(`/admin/incidents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        message: message.trim(),
        resolvedAt: status === "resolved" ? new Date().toISOString() : null,
      }),
    });
    if (!response.ok) {
      const error = response.error.message ?? "Could not post incident update";
      toast.error(error);
      throw new Error(error);
    }
    setMessage("");
    toast.success("Incident update published");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <select
        aria-label="Incident status"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
      >
        {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <Textarea
        aria-label="Incident update message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
        placeholder="Describe the latest status and customer impact…"
      />
      <Button onClick={() => setConfirmOpen(true)} disabled={!message.trim()}>
        <Send className="mr-1 h-4 w-4" />
        Publish update
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Publish ${status} incident update?`}
        description="This update and status will become visible on the public status page immediately."
        confirmLabel="Publish update"
        onConfirm={submit}
      />
    </div>
  );
}
