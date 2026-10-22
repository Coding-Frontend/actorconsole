import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export function FeatureIcon({
  icon: Icon,
  className,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-signal-orange/40 bg-signal-orange/10 text-signal-orange flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border",
        className,
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </div>
  );
}
