"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";

const apiBase = API_BASE_URL;

export function TicketReplyBox({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pending = useRef(false);
  const draftVersion = useRef(0);
  const replyId = useId();

  async function reply() {
    if (pending.current || !body.trim()) return;
    const submittedVersion = draftVersion.current;
    pending.current = true;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j?.error?.message ?? `Failed (${r.status})`);
        return;
      }
      if (draftVersion.current === submittedVersion) setBody("");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reply. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function close() {
    if (pending.current) throw new Error("Please wait for the current request to finish.");
    pending.current = true;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/tickets/${ticketId}/close`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? `Could not close the ticket (${r.status}).`);
      }
      startTransition(() => router.refresh());
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="border-border/40 space-y-2 border-t pt-4">
      <label htmlFor={replyId} className="sr-only">Reply</label>
      <textarea
        id={replyId}
        value={body}
        onChange={(e) => { draftVersion.current++; setBody(e.target.value); }}
        rows={4}
        placeholder="Write a reply…"
        className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
      />
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={() => setCloseOpen(true)} disabled={busy}>
          Close ticket
        </Button>
        <Button onClick={reply} disabled={busy || !body.trim()}>
          {busy ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Send className="mr-1 h-3 w-3" />
          )}
          Send reply
        </Button>
      </div>
      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close this ticket?"
        description="You will no longer be able to reply unless support reopens the ticket."
        confirmLabel="Close ticket"
        onConfirm={close}
      />
    </div>
  );
}
