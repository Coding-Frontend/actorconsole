"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/admin/api";
import { toast } from "sonner";

interface Admin {
  id: string;
  email: string;
  name: string | null;
}

export function TicketControls({
  ticketId,
  currentStatus,
  currentPriority,
  currentAssigneeId,
  admins,
}: {
  ticketId: string;
  currentStatus: string;
  currentPriority: string;
  currentAssigneeId: string | null;
  admins: Admin[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [priority, setPriority] = useState(currentPriority);
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await api(`/admin/support/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          priority,
          assigneeId: assigneeId || null,
        }),
      });
      if (!res.ok) {
        throw new Error(res.error.message ?? "Ticket update failed");
      }
      toast.success("Ticket updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ticket update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="ticket-status" className="text-muted-foreground text-xs font-medium">
          Status
        </label>
        <select
          id="ticket-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
        >
          <option value="OPEN">Open</option>
          <option value="PENDING">Waiting on user</option>
          <option value="RESPONDED">Responded</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="ticket-priority" className="text-muted-foreground text-xs font-medium">
          Priority
        </label>
        <select
          id="ticket-priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
        >
          <option value="LOW">Low</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="ticket-assignee" className="text-muted-foreground text-xs font-medium">
          Assignee
        </label>
        <select
          id="ticket-assignee"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
        >
          <option value="">Unassigned</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name ?? a.email}
            </option>
          ))}
        </select>
      </div>
      <Button size="sm" className="w-full" disabled={saving} onClick={save}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Update
      </Button>
    </div>
  );
}
