"use client";

import { type ReactNode } from "react";

/* ── Stacked Feature Section ──────────────────────── */

interface StackedSectionProps {
  children: ReactNode;
  /** Index (0-based) — determines when this section enters */
  index: number;
  /** Total number of stacked sections */
  total: number;
  /** Current scroll progress of the entire stack (0 → 1) */
  progress: number;
}

/**
 * Each feature section sits in a shared sticky container. A scene now has a
 * deliberate settle window: it enters, holds long enough to read, then yields
 * to the next scene. This keeps a fast wheel gesture from making the deck feel
 * like it is autoplaying through the features.
 */
export function StackedSection({ children, index, total, progress }: StackedSectionProps) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  // Each section occupies a 1/total slice of the scroll range. The middle
  // 76% is intentionally static so the user gets a readable pause at every
  // stop instead of a continuous carousel effect.
  const sectionStart = index / total;
  const sectionWidth = 1 / total;
  const settleRatio = 0.76;
  const transitionRatio = (1 - settleRatio) / 2;

  // Normalise progress within this section's range (0 → 1)
  const localProgress = Math.min(1, Math.max(0, (progress - sectionStart) / sectionWidth));

  // ── entrance / settle / exit ──
  // Subsequent sections slide from the right and then remain fully readable.
  const entranceProgress = Math.min(1, localProgress / transitionRatio);
  const exitProgress = Math.min(
    1,
    Math.max(0, (localProgress - (1 - transitionRatio)) / transitionRatio),
  );
  const translateX = isFirst ? 0 : (1 - entranceProgress) * 8;
  const scale = isFirst ? 1 : 0.98 + entranceProgress * 0.02;
  const opacity = isFirst
    ? 1 - exitProgress
    : Math.min(1, entranceProgress) * (isLast ? 1 : 1 - exitProgress);

  // Optimize page interaction: hide when section is inactive to prevent interception of clicks
  const isActive = opacity > 0.01;
  const isInteractive = opacity > 0.1;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        transform: `translateX(${translateX}vw) scale(${scale})`,
        opacity: Math.max(0, opacity),
        transition: "transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.42s ease-out",
        zIndex: index,
        pointerEvents: isInteractive ? "auto" : "none",
        visibility: isActive ? "visible" : "hidden",
      }}
    >
      <div className="flex h-full w-full items-center justify-center">{children}</div>
    </div>
  );
}
