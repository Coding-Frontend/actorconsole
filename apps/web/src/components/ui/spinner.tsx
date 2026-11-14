import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const spinnerSizes = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-6",
  xl: "size-8",
} as const;

export type SpinnerSize = keyof typeof spinnerSizes;

export interface SpinnerProps extends Omit<React.SVGProps<SVGSVGElement>, "ref" | "children"> {
  size?: SpinnerSize;
  /**
   * Text announced to assistive technology. Ignored when `decorative`.
   * Keep it specific ("Loading invoices") when the spinner stands alone.
   */
  label?: string;
  /**
   * Hide the spinner from assistive technology. Use this when nearby text or
   * an `aria-busy` container already says that something is loading, for
   * example inside a `<Button loading>`.
   */
  decorative?: boolean;
}

/**
 * Indeterminate progress indicator.
 *
 * Standalone, it renders a polite `role="status"` region with a visually
 * hidden label. Decorative, it is a plain icon hidden from screen readers.
 * Under `prefers-reduced-motion` the global stylesheet stops the rotation and
 * the static glyph plus label still communicate the state.
 */
export function Spinner({
  size = "md",
  label = "Loading",
  decorative = false,
  className,
  ...props
}: SpinnerProps) {
  const icon = (
    <Loader2
      data-slot="spinner"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0 animate-spin", spinnerSizes[size], className)}
      {...props}
    />
  );

  if (decorative) return icon;

  return (
    <span role="status" className="inline-flex items-center">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
