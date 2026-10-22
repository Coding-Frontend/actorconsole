"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PaymentRowActions({ payment }: { payment: any }) {
  const router = useRouter();
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);

  // Provider-specific refund adapters can be added independently. The existing
  // server refund flow is Razorpay-only, so do not expose a button that would
  // fail for Stripe or Dodo ledger entries.
  if (payment.status !== "captured" || payment.provider !== "razorpay") return null;

  async function refund() {
    if (!reason.trim()) return;
    const parsedAmount = amount.trim() ? Number(amount) : undefined;
    if (parsedAmount !== undefined && (!Number.isInteger(parsedAmount) || parsedAmount <= 0)) {
      toast.error("Enter a positive whole-number refund amount in paise");
      return;
    }
    setPending(true);
    const res = await api(`/admin/payments/${payment.id}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount: parsedAmount, reason: reason.trim() }),
    });
    if (!res.ok) toast.error(res.error.message ?? "Refund failed");
    else {
      toast.success("Refund processed");
      setRefundOpen(false);
      setReason("");
      setAmount("");
      router.refresh();
    }
    setPending(false);
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setRefundOpen(true)}>
        <RotateCcw className="h-4 w-4" />
        Refund
      </Button>
      <Dialog open={refundOpen} onOpenChange={(open) => !pending && setRefundOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund payment</DialogTitle>
            <DialogDescription>
              Record the reason for the refund. Leave the amount blank to refund the full payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`refund-reason-${payment.id}`}>Reason</Label>
              <Input
                id={`refund-reason-${payment.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Customer request"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`refund-amount-${payment.id}`}>Amount in paise (optional)</Label>
              <Input
                id={`refund-amount-${payment.id}`}
                type="number"
                min="0"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Full payment"
                disabled={pending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRefundOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void refund()}
              disabled={pending || !reason.trim()}
            >
              {pending ? "Processing…" : "Process refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
