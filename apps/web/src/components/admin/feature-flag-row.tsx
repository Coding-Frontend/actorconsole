"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { useRouter } from "next/navigation";

export function FeatureFlagRow({
  flagKey,
  description,
  initial,
}: {
  flagKey: string;
  description: string;
  initial: { enabled: boolean; rolloutPct: number };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [rolloutPct, setRolloutPct] = useState(String(initial.rolloutPct));
  const [savedRolloutPct, setSavedRolloutPct] = useState(initial.rolloutPct);
  const [pending, setPending] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<boolean | null>(null);
  const incidentControl = flagKey.startsWith("kill_switch_");

  async function save(next: { enabled: boolean; rolloutPct: number }): Promise<boolean> {
    setPending(true);
    const res = await api(`/admin/feature-flags/${flagKey}`, {
      method: "PUT",
      body: JSON.stringify(next),
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return false;
    }
    toast.success("Saved");
    router.refresh();
    return true;
  }

  async function saveRollout() {
    const nextRolloutPct = Number(rolloutPct);
    if (
      !rolloutPct.trim() ||
      !Number.isFinite(nextRolloutPct) ||
      nextRolloutPct < 0 ||
      nextRolloutPct > 100
    ) {
      toast.error("Rollout must be between 0 and 100 percent");
      return;
    }
    if (await save({ enabled, rolloutPct: nextRolloutPct })) {
      setSavedRolloutPct(nextRolloutPct);
      setRolloutPct(String(nextRolloutPct));
    }
  }

  async function toggle(nextEnabled: boolean) {
    if (incidentControl) {
      setPendingToggle(nextEnabled);
      return;
    }
    const previousEnabled = enabled;
    setEnabled(nextEnabled);
    if (!(await save({ enabled: nextEnabled, rolloutPct: savedRolloutPct }))) {
      setEnabled(previousEnabled);
    }
  }

  async function confirmIncidentToggle() {
    if (pendingToggle === null) return;
    if (!(await save({ enabled: pendingToggle, rolloutPct: savedRolloutPct }))) {
      throw new Error("The incident control could not be updated. Try again.");
    }
    setEnabled(pendingToggle);
    setPendingToggle(null);
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium">{flagKey}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            max={100}
            value={rolloutPct}
            onChange={(event) => setRolloutPct(event.target.value)}
            className="h-7 w-16 text-center text-xs"
            disabled={pending}
            aria-label={`${flagKey} rollout percentage`}
          />
          <span className="text-muted-foreground text-xs">%</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={pending || Number(rolloutPct) === savedRolloutPct}
            onClick={() => void saveRollout()}
          >
            Save
          </Button>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(value) => void toggle(value)}
          disabled={pending}
          aria-label={`${flagKey} enabled`}
        />
      </div>
      <ConfirmDialog
        open={pendingToggle !== null}
        onOpenChange={(open) => {
          if (!open) setPendingToggle(null);
        }}
        title={`${pendingToggle ? "Enable" : "Disable"} ${flagKey.replaceAll("_", " ")}?`}
        description={`${description} ${pendingToggle ? "This will restore access for the configured rollout." : "This will stop the feature for affected users immediately."} Current rollout: ${savedRolloutPct}%.`}
        confirmLabel={pendingToggle ? "Enable feature" : "Disable feature"}
        destructive={pendingToggle === false}
        onConfirm={confirmIncidentToggle}
      />
    </div>
  );
}
