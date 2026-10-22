import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import Link from "next/link";
import { Inbox } from "lucide-react";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: ButtonProps["variant"];
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  actionContent?: React.ReactNode;
  className?: string;
}

/**
 * ActorConsole EmptyState — a standardized empty state pattern with
 * icon, message, and optional primary/secondary actions.
 *
 * Always use this component instead of ad-hoc empty state markup.
 * Provides a consistent "illustration + message + CTA" pattern
 * across every list view in the app.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  actionContent,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-5 py-12 text-center sm:py-16",
        className,
      )}
    >
      <div className="text-signal-orange flex items-center gap-3" aria-hidden="true">
        <span className="bg-signal-orange/60 h-px w-7" />
        {icon ?? <Inbox className="h-5 w-5" />}
        <span className="bg-signal-orange/60 h-px w-7" />
      </div>
      <h3 className="text-foreground mt-4 text-base font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1.5 max-w-md text-sm leading-relaxed">{description}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        {actionContent}
        {action &&
          (action.href ? (
            <Button variant={action.variant ?? "default"} size="sm" asChild>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button variant={action.variant ?? "default"} size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
        {secondaryAction &&
          (secondaryAction.href ? (
            <Button variant={secondaryAction.variant ?? "outline"} size="sm" asChild>
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          ) : (
            <Button
              variant={secondaryAction.variant ?? "outline"}
              size="sm"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          ))}
      </div>
    </div>
  );
}
