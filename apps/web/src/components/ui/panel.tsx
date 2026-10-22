import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ActorConsole panel — quiet paper surface with enough structure for dense work.
 *
 * Variants:
 * - `default`: white card with a crisp border
 * - `muted`: same white card with a hairline Slate border
 * - `ink`: filled Carbon surface (used for inverted CTA panels)
 * - `ghost`: transparent, no border
 */
const panelVariants = {
  default: "border border-border/75 bg-card text-card-foreground shadow-none",
  muted: "border border-border bg-muted/40 text-foreground",
  ink: "border border-white/10 bg-ink text-white shadow-none [&_.panel-description]:text-white/70 [&_.panel-title]:text-white",
  ghost: "bg-transparent",
  // Legacy aliases from the old purple system — collapsed to ink
  // equivalents so non-home pages still typecheck cleanly.
  brand:
    "border border-white/10 bg-ink text-white shadow-none [&_.panel-description]:text-white/70 [&_.panel-title]:text-white",
  "brand-subtle": "border border-border/70 bg-card text-card-foreground",
} as const;

type PanelVariant = keyof typeof panelVariants | "brand-subtle";

type PanelRadius = "card" | "section" | "xl" | "2xl" | "none" | "panel";

const radiusClass: Record<Exclude<PanelRadius, "none">, string> = {
  card: "rounded-sm",
  section: "rounded-sm",
  // Keep legacy radius props source-compatible while rendering the same
  // compact workbench surface everywhere.
  xl: "rounded-sm",
  "2xl": "rounded-sm",
  panel: "rounded-sm",
};

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  radius?: PanelRadius;
  /** Remove padding for full-bleed content inside */
  noPadding?: boolean;
}

export function Panel({
  children,
  className,
  variant = "default",
  radius = "card",
  noPadding = false,
  ...props
}: PanelProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        radius !== "none" && radiusClass[radius],
        (panelVariants as Record<string, string>)[variant] ?? "bg-card shadow-none",
        !noPadding && "p-5 sm:p-6 lg:p-8",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * PanelHeader — consistent heading area inside a Panel.
 */
export function PanelHeader({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-6 max-w-2xl sm:mb-8", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * PanelTitle — large display heading using Space Grotesk.
 * line-height 1.13, letter-spacing -0.02em.
 */
export function PanelTitle({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "panel-title font-display-tight text-card-foreground lg:text-heading text-3xl sm:text-4xl",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

/**
 * PanelDescription — Inter 16px Graphite body copy.
 */
export function PanelDescription({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "panel-description text-muted-foreground mt-3 text-base leading-relaxed",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
