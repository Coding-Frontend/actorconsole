import * as React from "react";
import { cn } from "@/lib/utils";
import { GridContentBoundary } from "./grid-content-boundary";

type HomeGridSectionProps = React.HTMLAttributes<HTMLElement> & {
  frameClassName?: string;
};

/** Public section frame. Rules and dotted rails stay aligned down the page. */
export function HomeGridSection({
  children,
  className,
  frameClassName,
  ...props
}: HomeGridSectionProps) {
  return (
    <section className={cn("home-grid-section", className)} {...props}>
      <div className={cn("home-grid-frame", frameClassName)}>
        <GridContentBoundary>{children}</GridContentBoundary>
      </div>
    </section>
  );
}

export function HomeGridDivider({ number, title }: { number: string; title: string }) {
  return (
    <div className="home-grid-divider">
      <div className="home-grid-frame home-grid-divider-inner">
        <span className="data-stamp text-signal-orange">{number}</span>
        <p className="font-display-tight text-foreground text-lg sm:text-xl">{title}</p>
        <span className="home-grid-divider-rule" aria-hidden="true" />
      </div>
    </div>
  );
}

export function HomeGridRow({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("home-grid-row", className)} {...props}>
      {children}
    </div>
  );
}

export function HomeGridCell({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("home-grid-cell", className)} {...props}>
      {children}
    </div>
  );
}
