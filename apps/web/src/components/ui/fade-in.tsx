"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIntersection } from "@/hooks/use-intersection";

type FadeDirection = "up" | "none" | "scale";

interface FadeInProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Animation direction */
  direction?: FadeDirection;
  /** Delay in ms before animation starts */
  delay?: number;
  /** How long the animation runs (Tailwind duration utility value, e.g. 500) */
  duration?: number;
}

/**
 * FadeIn — wraps content that fades in when scrolled into view.
 *
 * @example
 * <FadeIn delay={200}>
 *   <Card>...</Card>
 * </FadeIn>
 */
export function FadeIn({
  children,
  className,
  direction = "up",
  delay = 0,
  duration = 600,
  ...props
}: FadeInProps) {
  const { ref, isVisible } = useIntersection({ triggerOnce: true });

  const animationClass =
    direction === "up"
      ? "animate-fade-in-up"
      : direction === "scale"
        ? "animate-scale-in"
        : "animate-fade-in";

  return (
    <div
      ref={ref}
      className={cn("opacity-0", isVisible && animationClass, className)}
      style={{
        animationDelay: `${delay}ms`,
        animationDuration: `${duration}ms`,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
