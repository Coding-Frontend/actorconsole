import * as React from "react";
import { ActorMark } from "@/components/brand/actor-mark";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  size?: "sm" | "md" | "lg";
  showDescriptor?: boolean;
  descriptor?: string;
};

const sizes = {
  sm: { mark: 28, wordmark: "text-[17px]", descriptor: "text-[10px]" },
  md: { mark: 36, wordmark: "text-[22px]", descriptor: "text-[10px]" },
  lg: { mark: 48, wordmark: "text-[28px]", descriptor: "text-[11px]" },
} as const;

/** Shared responsive lockup for marketing, auth, dashboard, and error surfaces. */
export function BrandLogo({
  className,
  markClassName,
  size = "md",
  showDescriptor = false,
  descriptor = "Actor operations",
}: BrandLogoProps) {
  const scale = sizes[size];

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <ActorMark size={scale.mark} className={cn("drop-shadow-sm", markClassName)} />
      <span className="min-w-0">
        <span className={cn("font-display-tight block truncate", scale.wordmark)}>ActorConsole</span>
        {showDescriptor && (
          <span
            className={cn(
              "text-muted-foreground mt-0.5 block truncate font-mono uppercase tracking-[0.16em]",
              scale.descriptor,
            )}
          >
            {descriptor}
          </span>
        )}
      </span>
    </span>
  );
}
