"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks how far the user has scrolled through a tall container (0 → 1).
 *
 * Mount a tall wrapper (e.g. `h-[250vh]`) and put a `sticky top-0 h-screen`
 * child inside. The returned `progress` value maps the wrapper's scroll
 * range to 0–1 so you can derive horizontal translate or parallax offsets.
 */
export function useScrollProgress() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const targetProgress = useRef(0);
  const renderedProgress = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let ticking = false;

    const updateTarget = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const scrollable = rect.height - vh;

      if (scrollable <= 0) {
        targetProgress.current = 0;
        return;
      }

      // 0 = container top at viewport bottom, 1 = container bottom at viewport top
      const raw = -rect.top / scrollable;
      targetProgress.current = Math.min(1, Math.max(0, raw));
    };

    const animate = () => {
      const delta = targetProgress.current - renderedProgress.current;
      renderedProgress.current += delta * 0.16;
      if (Math.abs(delta) < 0.0004) {
        renderedProgress.current = targetProgress.current;
        frame.current = null;
      } else {
        frame.current = requestAnimationFrame(animate);
      }
      setProgress(renderedProgress.current);
    };

    const scheduleAnimation = () => {
      if (frame.current == null) frame.current = requestAnimationFrame(animate);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateTarget();
        scheduleAnimation();
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // run once to set initial value
    updateTarget();
    scheduleAnimation();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return { containerRef, progress };
}
