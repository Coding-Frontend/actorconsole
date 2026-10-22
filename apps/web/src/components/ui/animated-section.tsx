"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { cn } from "@/lib/utils";

type AnimationType = "fade-in-up" | "fade-in" | "scale-in" | "slide-in-left" | "slide-in-right";

interface AnimatedSectionProps {
  children: ReactNode;
  type?: AnimationType;
  delay?: number;
  duration?: number;
  className?: string;
  threshold?: number;
}

const ANIMATION_CLASSES: Record<AnimationType, string> = {
  "fade-in-up": "translate-y-6 opacity-0",
  "fade-in": "opacity-0",
  "scale-in": "scale-95 opacity-0",
  "slide-in-left": "-translate-x-8 opacity-0",
  "slide-in-right": "translate-x-8 opacity-0",
};

/**
 * Scroll-triggered animation wrapper — applies entrance animation
 * when the element scrolls into view. Fully accessible (respects
 * prefers-reduced-motion).
 */
export function AnimatedSection({
  children,
  type = "fade-in-up",
  delay = 0,
  duration = 600,
  className,
  threshold = 0.15,
}: AnimatedSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all",
        ANIMATION_CLASSES[type],
        isVisible && "translate-x-0 translate-y-0 scale-100 opacity-100",
        className,
      )}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Staggered children animation — wraps a list of items that animate
 * in one after another.
 */
export function StaggerContainer({
  children,
  className,
  staggerDelay = 100,
  baseDelay = 0,
}: {
  children: ReactNode[];
  className?: string;
  staggerDelay?: number;
  baseDelay?: number;
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <AnimatedSection key={i} delay={baseDelay + i * staggerDelay}>
          {child}
        </AnimatedSection>
      ))}
    </div>
  );
}
