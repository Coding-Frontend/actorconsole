"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DeletionPendingScreen({ scheduledFor }: { scheduledFor: string }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);

  async function cancelDeletion() {
    setCancelling(true);
    try {
      const response = await fetch(`${API_BASE_URL}/account/deletion/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "Cancellation failed");
      toast.success("Account deletion cancelled");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl py-16">
      <Card>
        <CardHeader>
          <CardTitle>Account deletion is pending</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Dashboard actions are locked until deletion is cancelled. Your account is scheduled for
            permanent deletion on {new Date(scheduledFor).toLocaleString()}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={cancelDeletion} disabled={cancelling}>
              {cancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Cancel deletion
            </Button>
            <Button variant="outline" asChild>
              <a href={`${API_BASE_URL}/account/export`}>
                <Download className="h-4 w-4" /> Export my data
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
