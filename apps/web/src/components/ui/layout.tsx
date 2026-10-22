import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { GridContentBoundary } from "@/components/marketing/grid-content-boundary";

/* ── Container ────────────────────────────────────── */

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Container({ children, className, ...props }: ContainerProps) {
  return (
    <div
      className={cn(
        "site-container mx-auto w-full min-w-0 max-w-[1440px] px-5 sm:px-8 lg:px-8",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ── Section ──────────────────────────────────────── */

type SectionVariant =
  | "default"
  | "muted"
  | "ink"
  | "inverted"
  // Legacy aliases from the old purple system.
  | "brand-subtle"
  | "brand";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  variant?: SectionVariant;
}

const sectionBg: Record<SectionVariant, string> = {
  default: "bg-mist",
  muted: "bg-fog",
  ink: "semantic-accent-panel text-foreground",
  inverted: "bg-card",
  "brand-subtle": "bg-mist",
  brand: "semantic-accent-panel text-foreground",
};

export function Section({ children, className, variant = "default", ...props }: SectionProps) {
  return (
    <section
      // Keep the default rhythm separate from page-level pt-/pb- overrides.
      className={cn("section-shell blueprint-section", sectionBg[variant], className)}
      {...props}
    >
      <Container>
        <GridContentBoundary>{children}</GridContentBoundary>
      </Container>
    </section>
  );
}

/* ── Section split (asymmetric layout) ────────────── */

interface SectionSplitProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Put the visual block on the right (true) or left (false) */
  visualRight?: boolean;
  children: [React.ReactNode, React.ReactNode];
}

/**
 * Asymmetric two-column split: text content + visual.
 * Stacks on mobile. Generous 60px gap on desktop.
 */
export function SectionSplit({
  children,
  visualRight = true,
  className,
  ...props
}: SectionSplitProps) {
  const [content, visual] = React.Children.toArray(children);
  return (
    <div
      className={cn(
        "lg:divide-border grid min-w-0 items-stretch gap-8 sm:gap-10 lg:grid-cols-2 lg:gap-0 lg:divide-x xl:gap-0",
        className,
      )}
      {...props}
    >
      {visualRight ? (
        <>
          <div className="order-2 min-w-0 lg:order-1">{content}</div>
          <div className="order-1 min-w-0 lg:order-2">{visual}</div>
        </>
      ) : (
        <>
          <div className="order-1 min-w-0">{visual}</div>
          <div className="order-2 min-w-0">{content}</div>
        </>
      )}
    </div>
  );
}

SectionSplit.Content = function SectionSplitContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("min-w-0 max-w-xl lg:pr-12", className)} {...props}>
      {children}
    </div>
  );
};

SectionSplit.Visual = function SectionSplitVisual({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative min-w-0 lg:pl-12", className)} {...props}>
      {children}
    </div>
  );
};

/* ── NavLink ──────────────────────────────────────── */

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}

/**
 * Navigation link with an editorial active rule instead of a capsule.
 */
export function NavLink({ href, children, className, active }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-visible:ring-ring focus-visible:ring-offset-background rounded-sm border-b-2 border-transparent px-2 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        active
          ? "border-signal-orange bg-signal-orange/10 text-foreground font-semibold"
          : "text-muted-foreground hover:border-border hover:text-foreground",
        className,
      )}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
