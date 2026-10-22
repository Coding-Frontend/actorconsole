"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface EmailLogRow {
  id: string;
  to: string;
  subject: string;
  template?: string | null;
  status: string;
  providerId?: string | null;
  eventType?: string | null;
  error?: string | null;
  createdAt: string;
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</dt>
      <dd className="break-words text-sm">{value || "—"}</dd>
    </div>
  );
}

export function EmailLogRowActions({ email }: { email: EmailLogRow }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Inspect email to ${email.to}`}>
          <Eye className="h-4 w-4" />
          Inspect
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email delivery details</DialogTitle>
          <DialogDescription>
            Inspect the provider reference, delivery event, and failure details for this message.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Recipient" value={email.to} />
          <Detail label="Status" value={email.status} />
          <div className="sm:col-span-2">
            <Detail label="Subject" value={email.subject} />
          </div>
          <Detail label="Template" value={email.template} />
          <Detail label="Event type" value={email.eventType} />
          <div className="sm:col-span-2">
            <Detail label="Provider ID" value={email.providerId} />
          </div>
          <div className="sm:col-span-2">
            <Detail label="Provider error" value={email.error} />
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
