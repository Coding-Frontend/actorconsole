"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ActorCardActionsProps {
  actorId: string;
  actorName: string;
  initialTitle: string | null;
  onRenamed?: () => void;
  alwaysVisible?: boolean;
}

export function ActorCardActions({
  actorId,
  actorName,
  initialTitle,
  onRenamed,
  alwaysVisible = false,
}: ActorCardActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(initialTitle ?? actorName);
  const [renaming, startRename] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  function handleSave() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === (initialTitle ?? actorName)) {
      setIsEditing(false);
      setEditValue(initialTitle ?? actorName);
      return;
    }

    startRename(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/actors/${actorId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(payload?.error?.message ?? "Failed to rename actor");
        }
        setIsEditing(false);
        toast.success("Actor renamed");
        if (onRenamed) onRenamed();
        else router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to rename actor");
        setEditValue(initialTitle ?? actorName);
      }
    });
  }

  function handleCancel() {
    setIsEditing(false);
    setEditValue(initialTitle ?? actorName);
  }

  return (
    <div className="flex items-center gap-1">
      {isEditing ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSave();
              if (event.key === "Escape") handleCancel();
            }}
            className="border-border/60 bg-background focus:border-signal-orange/60 focus:ring-signal-orange/20 h-6 w-40 rounded border px-1.5 text-xs font-medium outline-none focus:ring-1"
            aria-label="Actor display name"
            maxLength={200}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={renaming}
            className="text-signal-green hover:bg-accent rounded p-0.5"
            aria-label="Save actor name"
          >
            {renaming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-muted-foreground hover:bg-accent rounded p-0.5"
            aria-label="Cancel actor rename"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className={`hover:text-foreground hover:bg-accent rounded-md p-1 transition-all focus:opacity-100 ${
            alwaysVisible
              ? "text-muted-foreground opacity-100"
              : "text-muted-foreground/30 opacity-0 group-hover/card:opacity-100"
          }`}
          aria-label="Rename actor"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
