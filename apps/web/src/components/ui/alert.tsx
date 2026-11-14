import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ActorConsole alert — an inline message about the state of the page or of
 * an action: a failed save, a partial result, a confirmation, a heads-up.
 *
 * Tone colours only the rule and icon; title and body stay on foreground
 * tokens so every tone keeps body-text contrast in light and dark themes.
 */
const alertVariants = cva(
  "workbench-control relative flex w-full items-start gap-3 rounded-sm border border-l-2 px-4 py-3 text-sm",
  {
    variants: {
      tone: {
        neutral: "border-border border-l-foreground/40 bg-card [--alert-accent:hsl(var(--muted-foreground))]",
        info: "border-signal-blue/30 border-l-signal-blue bg-signal-blue/5 [--alert-accent:var(--color-signal-blue)]",
        success:
          "border-signal-green/30 border-l-signal-green bg-signal-green/5 [--alert-accent:var(--color-signal-green)]",
        warning:
          "border-signal-orange/35 border-l-signal-orange bg-signal-orange/5 [--alert-accent:var(--color-signal-orange)]",
        danger:
          "border-destructive/35 border-l-destructive bg-destructive/5 [--alert-accent:hsl(var(--destructive))]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type AlertTone = NonNullable<VariantProps<typeof alertVariants>["tone"]>;

const defaultIcons: Record<AlertTone, React.ComponentType<{ className?: string }>> = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

/**
 * How the alert is announced when it appears.
 * - `assertive`: `role="alert"`, interrupts. Default for `danger`.
 * - `polite`: `role="status"`, waits for a pause. Default for other tones.
 * - `off`: no live region, for messages present on first paint that should
 *   be read in document order rather than announced.
 */
export type AlertLive = "assertive" | "polite" | "off";

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">, VariantProps<typeof alertVariants> {
  /** Short summary. Optional, but give one whenever the body runs past a sentence. */
  title?: React.ReactNode;
  /** Replace the tone icon, or pass `false` to render without one. */
  icon?: React.ReactNode | false;
  /** Controls such as a retry button. Wraps under the message on narrow screens. */
  action?: React.ReactNode;
  /** Shows a close button when provided. The parent decides whether to unmount. */
  onDismiss?: () => void;
  /** Accessible name for the close button. */
  dismissLabel?: string;
  live?: AlertLive;
}

const liveRole: Record<Exclude<AlertLive, "off">, "alert" | "status"> = {
  assertive: "alert",
  polite: "status",
};

/**
 * Live regions announce content inserted into them, so render the alert
 * conditionally (`{error ? <Alert …/> : null}`) rather than toggling `hidden`.
 */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      tone,
      title,
      icon,
      action,
      onDismiss,
      dismissLabel = "Dismiss",
      live,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const resolvedTone: AlertTone = tone ?? "neutral";
    const resolvedLive: AlertLive = live ?? (resolvedTone === "danger" ? "assertive" : "polite");
    const DefaultIcon = defaultIcons[resolvedTone];
    const renderedIcon = icon === false ? null : (icon ?? <DefaultIcon className="size-4" />);

    return (
      <div
        ref={ref}
        role={resolvedLive === "off" ? undefined : liveRole[resolvedLive]}
        data-tone={resolvedTone}
        className={cn(alertVariants({ tone: resolvedTone }), className)}
        {...props}
      >
        {renderedIcon ? (
          <span
            aria-hidden="true"
            className="mt-0.5 flex shrink-0 text-[color:var(--alert-accent)] [&_svg]:size-4"
          >
            {renderedIcon}
          </span>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 break-words">
            {title ? <p className="text-foreground font-semibold leading-5">{title}</p> : null}
            {children ? (
              <div
                className={cn(
                  "text-muted-foreground leading-5 [&_a]:underline [&_a]:underline-offset-2",
                  title && "mt-0.5",
                )}
              >
                {children}
              </div>
            ) : null}
          </div>
          {action ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
          ) : null}
        </div>

        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-ring -my-1 -mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    );
  },
);
Alert.displayName = "Alert";

export { alertVariants };
