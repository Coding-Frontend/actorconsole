"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function PlanMarketingFeatureEditor({
  plan,
  initialLabels,
}: {
  plan: "FREE" | "PRO";
  initialLabels: string[];
}) {
  const [value, setValue] = useState(initialLabels.join("\n"));
  const [pending, startTransition] = useTransition();

  function save() {
    const labels = [
      ...new Set(
        value
          .split("\n")
          .map((label) => label.trim())
          .filter(Boolean),
      ),
    ];
    startTransition(async () => {
      const result = await api(`/admin/plan-features/${plan}`, {
        method: "PUT",
        body: JSON.stringify({ features: labels.map((label) => ({ label, enabled: true })) }),
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setValue(labels.join("\n"));
      toast.success(`${plan} pricing copy saved`);
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={Math.max(4, Math.min(10, value.split("\n").length + 1))}
        placeholder="One customer-facing feature per line"
        disabled={pending}
        aria-label={`${plan} plan marketing features`}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          One feature per line. Empty lines are ignored.
        </p>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save copy"}
        </Button>
      </div>
    </div>
  );
}
