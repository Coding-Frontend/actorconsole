"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { Button } from "@/components/ui/button";

type FinancialSyncScope = "usage" | "costs" | "revenue";

const scopeLabels: Record<FinancialSyncScope, string> = {
  usage: "usage",
  costs: "costs",
  revenue: "revenue",
};

export function UsageSyncButton({ scope = "usage" }: { scope?: FinancialSyncScope }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      if (scope !== "usage") {
        const accountResponse = await fetch(`${API_BASE_URL}/actors/${scope}/account-refresh`, {
          method: "POST",
          credentials: "include",
        });
        const accountBody = await accountResponse.json().catch(() => null);
        if (!accountResponse.ok || accountBody?.data?.credentialIssue) {
          const message =
            accountBody?.data?.credentialIssue?.message ??
            accountBody?.error?.message ??
            "Console account analytics could not be refreshed";
          if (scope === "revenue") {
            throw new Error(message);
          }
          toast.warning(`${message} Direct Actor costs will still synchronize from the API key.`);
        }
      }
      const response = await fetch(`${API_BASE_URL}/actors/${scope}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not start usage sync");
      if (!body?.data?.queued) {
        toast.info("There are no tracked Actors to synchronize yet");
        router.refresh();
        return;
      }
      toast.info(
        `Synchronizing ${scopeLabels[scope]} for ${body.data.queued} Actor${body.data.queued === 1 ? "" : "s"}…`,
      );
      toast.success(
        `${scopeLabels[scope][0]!.toUpperCase()}${scopeLabels[scope].slice(1)} charts are updated. Actor-level history continues in the background.`,
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not synchronize usage data");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button variant="signal" onClick={sync} disabled={syncing}>
      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? `Syncing ${scopeLabels[scope]}…` : `Sync ${scopeLabels[scope]}`}
    </Button>
  );
}
