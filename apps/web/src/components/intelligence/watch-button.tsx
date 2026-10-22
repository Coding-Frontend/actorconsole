"use client";

import { navigateInApp } from "@/lib/client-navigation";
import { useState } from "react";
import { Bookmark, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/api-base";

export function WatchButton({ storeActorId }: { storeActorId: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  async function save() {
    setState("saving");
    try {
      const response = await fetch(`${API_BASE_URL}/intelligence/watches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeActorId }),
      });
      const result = await response.json();
      if (response.status === 401) {
        navigateInApp(`/login?callbackUrl=${encodeURIComponent("/dashboard/watchlist")}`);
        return;
      }
      if (!response.ok)
        throw new Error(result.error?.message ?? "Could not save Actor. Try again.");
      setState("saved");
      toast.success("Actor saved to your workspace watchlist.");
    } catch (error) {
      setState("idle");
      toast.error(error instanceof Error ? error.message : "Could not save Actor.");
    }
  }
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={save}
      disabled={state !== "idle"}
      aria-label={state === "saved" ? "Actor saved" : "Watch this Actor"}
    >
      {state === "saved" ? <Check /> : <Bookmark />}
      {state === "saved" ? "Watching" : state === "saving" ? "Saving…" : "Watch"}
    </Button>
  );
}
