"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";

const apiBase = API_BASE_URL;

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function markAll() {
    startTransition(async () => {
      const response = await fetch(`${apiBase}/notifications/read-all`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        toast.error("Could not mark notifications as read");
        return;
      }
      window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={markAll} disabled={pending}>
      <CheckCheck className="mr-1 h-4 w-4" />
      Mark all read
    </Button>
  );
}
