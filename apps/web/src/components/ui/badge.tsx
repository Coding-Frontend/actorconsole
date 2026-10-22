import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * ActorConsole badge — a compact instrument label, not a decorative pill.
 */
const badgeVariants = cva(
  "workbench-control inline-flex min-h-6 items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-[11px] font-medium leading-4 tracking-[0.01em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground",
        secondary: "border-border bg-secondary text-secondary-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-destructive",
        outline: "border-input bg-card/60 text-foreground",
        success: "border-signal-green/30 bg-signal-green/10 text-signal-green",
        warning: "border-signal-orange/30 bg-signal-orange/10 text-signal-orange",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
