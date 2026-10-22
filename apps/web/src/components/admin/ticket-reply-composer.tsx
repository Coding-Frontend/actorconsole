"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { api } from "@/lib/admin/api";

export function TicketReplyComposer({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await api<{
        emailDelivery: { ok: boolean; error?: string };
      }>(`/admin/support/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!result.ok) {
        toast.error(result.error.message ?? "Reply failed");
        return;
      }
      setBody("");
      if (result.data.emailDelivery.ok) toast.success("Reply sent and user notified");
      else toast.warning("Reply saved, but the email notification failed");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <label htmlFor="admin-ticket-reply" className="text-sm font-medium">
        Reply to user
      </label>
      <Textarea
        id="admin-ticket-reply"
        rows={5}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={closed ? "Reopen the ticket before replying." : "Write a support reply…"}
        disabled={closed || pending}
      />
      <Button onClick={submit} disabled={closed || pending || !body.trim()}>
        <Send className="h-4 w-4" /> Send reply
      </Button>
    </div>
  );
}
