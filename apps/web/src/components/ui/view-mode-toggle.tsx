"use client";

import { Grid2X2, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type CollectionViewMode = "grid" | "list";

export function ViewModeToggle({
  value,
  onValueChange,
  className,
  label = "Collection view",
}: {
  value: CollectionViewMode;
  onValueChange: (value: CollectionViewMode) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("border-border bg-background inline-flex rounded-md border p-0.5", className)}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onValueChange("grid")}
        aria-pressed={value === "grid"}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[3px] px-2.5 text-xs font-medium transition-colors",
          value === "grid"
            ? "bg-signal-orange text-ink shadow-sm"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Grid2X2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Grid</span>
        <span className="sr-only sm:hidden">Grid view</span>
      </button>
      <button
        type="button"
        onClick={() => onValueChange("list")}
        aria-pressed={value === "list"}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[3px] px-2.5 text-xs font-medium transition-colors",
          value === "list"
            ? "bg-signal-orange text-ink shadow-sm"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <List className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">List</span>
        <span className="sr-only sm:hidden">List view</span>
      </button>
    </div>
  );
}
