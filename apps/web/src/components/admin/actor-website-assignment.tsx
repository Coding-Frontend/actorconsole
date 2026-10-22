"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { Button } from "@/components/ui/button";

export function ActorWebsiteAssignment({
  actorId,
  currentWebsiteId,
  websites,
}: {
  actorId: string;
  currentWebsiteId: string | null;
  websites: Array<{ id: string; name: string }>;
}) {
  const [value, setValue] = useState(currentWebsiteId ?? "");
  const [savedValue, setSavedValue] = useState(currentWebsiteId ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  async function save() {
    if (!value) return;
    setSaving(true);
    const response = await api(`/admin/website-logos/${value}/assign`, {
      method: "POST",
      body: JSON.stringify({ workspaceActorIds: [actorId] }),
    });
    if (response.ok) {
      setSavedValue(value);
      toast.success("Actor website classification updated");
      router.refresh();
    } else toast.error(response.error.message);
    setSaving(false);
  }
  return (
    <div className="space-y-2">
      <label className="text-muted-foreground text-xs" htmlFor="actor-website">
        Website classification
      </label>
      <div className="flex gap-2">
        <select
          id="actor-website"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-2 text-sm"
        >
          <option value="">Unclassified</option>
          {websites.map((website) => (
            <option key={website.id} value={website.id}>
              {website.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={!value || saving || value === savedValue}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Assign"}
        </Button>
      </div>
    </div>
  );
}
