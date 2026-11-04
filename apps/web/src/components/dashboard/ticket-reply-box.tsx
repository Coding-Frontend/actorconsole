"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { useSessionDraft } from "@/lib/use-session-draft";

const apiBase = API_BASE_URL;

const emptyReply = { body: "" };
function validReply(value: unknown): value is typeof emptyReply {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as typeof emptyReply).body === "string" &&
    (value as typeof emptyReply).body.length <= 10000,
  );
}

export function TicketReplyBox({ ticketId, userId }: { ticketId: string; userId: string }) {
  const router = useRouter();
  const draft = useSessionDraft(
    `actorconsole:support-reply:${userId}:${ticketId}`,
    emptyReply,
    validReply,
  );
  const body = draft.value.body;
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
      if (draftVersion.current === submittedVersion) draft.clear();
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
      draft.clear();
      startTransition(() => router.refresh());
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-border/40 pt-4">
      {draft.dirty || draft.restored ? (
        <p role="status" className="text-xs text-muted-foreground">
          {draft.storageAvailable
            ? "Your reply draft is saved in this tab."
            : "Draft saving is unavailable. Copy your reply before leaving this page."}
        </p>
      ) : null}
      <label htmlFor={replyId} className="sr-only">
        Reply
      </label>
      <textarea
        id={replyId}
        value={body}
        onChange={(e) => {
          draftVersion.current++;
          draft.setValue({ body: e.target.value });
        }}
        disabled={!draft.ready}
        maxLength={10000}
        rows={4}
        placeholder="Write a reply…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          onClick={() => setCloseOpen(true)}
          disabled={busy || !draft.ready}
        >
          Close ticket
        </Button>
        <Button
          onClick={reply}
          className="min-h-11"
          disabled={busy || !draft.ready || !body.trim()}
        >
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
        description={
          body.trim()
            ? "Your unsent reply will be discarded. You will no longer be able to reply unless support reopens the ticket."
            : "You will no longer be able to reply unless support reopens the ticket."
        }
        confirmLabel="Close ticket"
        onConfirm={close}
      />
    </div>
  );
}
