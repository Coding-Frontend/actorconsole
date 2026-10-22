"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Filter,
  Info,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Tabs } from "@/components/ui/tabs";

export interface PageActionItem {
  label: string;
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export type DashboardAsyncStatus =
  "loading" | "refreshing" | "ready" | "empty" | "warning" | "rate-limited" | "error" | "success";

export interface DashboardBreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Small, reusable breadcrumb row for dashboard pages. It deliberately stays
 * text-first so it remains useful on compact mobile layouts and in screen
 * reader navigation landmarks.
 */
export function DashboardBreadcrumbs({
  items,
  className,
}: {
  items: DashboardBreadcrumbItem[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs", className)}
    >
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex min-w-0 items-center gap-1.5">
          {index ? (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
          ) : null}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-foreground truncate underline-offset-4 hover:underline"
            >
              {item.label}
            </Link>
          ) : (
            <span
              className="truncate"
              aria-current={index === items.length - 1 ? "page" : undefined}
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * Shared async state language for dashboard panels. Data pages can keep their
 * cached content mounted while showing `refreshing` in a compact status row,
 * instead of replacing a useful table with a full-page spinner.
 */
export function DashboardAsyncState({
  status,
  title,
  description,
  onRetry,
  retryLabel = "Try again",
  children,
  className,
}: {
  status: DashboardAsyncStatus;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  if (status === "ready" || status === "success") return children ?? null;

  const copy: Record<
    Exclude<DashboardAsyncStatus, "ready" | "success">,
    {
      title: string;
      description: string;
      icon: ReactNode;
      tone: string;
    }
  > = {
    loading: {
      title: "Loading workspace data",
      description: "Your cached data will remain available while the latest snapshot loads.",
      icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />,
      tone: "border-border/70 bg-card text-muted-foreground",
    },
    refreshing: {
      title: "Refreshing workspace data",
      description: "The latest Apify snapshot is being fetched in the background.",
      icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />,
      tone: "border-signal-blue/30 bg-signal-blue/5 text-signal-blue",
    },
    empty: {
      title: "Nothing here yet",
      description: "Connect the workspace or adjust the filters to begin.",
      icon: <Info className="h-4 w-4" aria-hidden="true" />,
      tone: "border-border/70 bg-card text-muted-foreground",
    },
    warning: {
      title: "Some data needs attention",
      description: "Available values are shown while the remaining coverage is repaired.",
      icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
      tone: "border-signal-orange/35 bg-signal-orange/5 text-signal-orange",
    },
    "rate-limited": {
      title: "Apify rate limit reached",
      description: "We will retry automatically with backoff. You can also retry now.",
      icon: <RotateCcw className="h-4 w-4" aria-hidden="true" />,
      tone: "border-signal-orange/35 bg-signal-orange/5 text-signal-orange",
    },
    error: {
      title: "Could not load this view",
      description: "The workspace data service returned an error. Try again or check credentials.",
      icon: <AlertCircle className="h-4 w-4" aria-hidden="true" />,
      tone: "border-destructive/35 bg-destructive/5 text-destructive",
    },
  };
  const stateCopy = copy[status];

  return (
    <section
      className={cn("rounded-sm border px-4 py-3 shadow-sm", stateCopy.tone, className)}
      role={status === "error" || status === "rate-limited" ? "alert" : "status"}
      aria-live="polite"
      data-dashboard-state={status}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{stateCopy.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title ?? stateCopy.title}</p>
          <p className="mt-0.5 text-xs leading-5 opacity-85">
            {description ?? stateCopy.description}
          </p>
          {children ? <div className="mt-2">{children}</div> : null}
        </div>
        {onRetry && (status === "error" || status === "rate-limited" || status === "warning") ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" /> {retryLabel}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function DashboardFilterRail({
  children,
  label = "Filters",
  className,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <section className={cn("dashboard-filter-rail", className)} aria-label={label}>
      {children}
    </section>
  );
}

export function DashboardFilterSummary({
  label = "Current scope",
  items,
  onReset,
}: {
  label?: string;
  items: string[];
  onReset?: () => void;
}) {
  return (
    <div
      className="border-border/60 bg-muted/20 flex flex-wrap items-center gap-2 rounded-sm border px-3 py-2 text-xs"
      role="status"
    >
      <span className="text-muted-foreground font-semibold">{label}</span>
      {items.filter(Boolean).map((item) => (
        <span
          key={item}
          className="border-border bg-card text-foreground rounded-sm border px-2 py-1 font-mono text-[10px]"
        >
          {item}
        </span>
      ))}
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" /> Reset
        </button>
      ) : null}
    </div>
  );
}

export function DashboardTableToolbar({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-display-tight text-xl">{title}</h2>
        {description ? (
          <p className="text-muted-foreground mt-1 text-xs leading-5">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function PageActionMenu({
  items,
  label = "More actions",
  triggerText = "More",
}: {
  items: PageActionItem[];
  label?: string;
  triggerText?: string;
}) {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const { label: itemLabel, icon, href, onSelect, disabled, destructive } = items[0]!;
    const content = (
      <>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        <span>{itemLabel}</span>
      </>
    );

    return (
      <Button
        type={href && !disabled ? undefined : "button"}
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={onSelect}
        asChild={Boolean(href) && !disabled}
        className={cn(
          destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
        )}
      >
        {href && !disabled ? <Link href={href}>{content}</Link> : content}
      </Button>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size="sm" aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
          <span>{triggerText}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="border-border bg-card text-card-foreground z-50 min-w-52 max-w-[calc(100vw-1rem)] overflow-hidden rounded-sm border p-1.5 shadow-2xl"
        >
          {items.map(({ label: itemLabel, icon, href, onSelect, disabled, destructive }) => {
            const className = cn(
              "focus:bg-accent focus:text-foreground flex min-w-0 cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs font-medium outline-none",
              disabled && "pointer-events-none opacity-45",
              destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive",
            );
            const content = (
              <>
                {icon ? <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span> : null}
                <span className="min-w-0 truncate">{itemLabel}</span>
              </>
            );

            return (
              <DropdownMenu.Item
                key={itemLabel}
                disabled={disabled}
                onSelect={onSelect}
                asChild={Boolean(href)}
                className={className}
              >
                {href ? (
                  <Link href={href}>{content}</Link>
                ) : (
                  <button type="button">{content}</button>
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function DashboardPageHeader({
  context,
  title,
  description,
  breadcrumbs,
  primaryAction,
  secondaryActions = [],
  status,
  className,
}: {
  context: string;
  title: string;
  description?: string;
  breadcrumbs?: DashboardBreadcrumbItem[];
  primaryAction?: ReactNode;
  secondaryActions?: PageActionItem[];
  status?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "border-border/80 bg-card relative overflow-hidden rounded-sm border shadow-sm",
        className,
      )}
    >
      <span className="bg-signal-orange absolute inset-y-0 left-0 w-1" aria-hidden="true" />
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:px-7">
        <div className="min-w-0 max-w-3xl">
          {breadcrumbs?.length ? (
            <DashboardBreadcrumbs items={breadcrumbs} className="mb-3" />
          ) : null}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-signal-orange font-mono text-[10px] font-semibold uppercase tracking-[0.13em]">
              {context}
            </p>
            {status}
          </div>
          <h2 className="font-display-tight text-[28px] leading-[1.05] sm:text-[32px]">{title}</h2>
          {description ? (
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">{description}</p>
          ) : null}
        </div>
        {primaryAction || secondaryActions.length ? (
          <div
            className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto"
            aria-label="Page actions"
          >
            {secondaryActions.length ? <PageActionMenu items={secondaryActions} /> : null}
            {primaryAction ? (
              <div className="min-w-0 flex-1 sm:flex-none [&>*]:w-full sm:[&>*]:w-auto">
                {primaryAction}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function SelectionActionBar({
  count,
  noun = "item",
  description,
  onClear,
  children,
  className,
}: {
  count: number;
  noun?: string;
  description?: string;
  onClear?: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (count < 1) return null;

  return (
    <div
      className={cn(
        "border-signal-blue/30 bg-card/95 sticky bottom-3 z-20 flex flex-col gap-3 rounded-sm border px-4 py-3 shadow-2xl backdrop-blur-xl lg:bottom-auto lg:top-[calc(var(--app-shell-header-height,4rem)+0.75rem)] lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
      role="region"
      aria-label="Selection actions"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-signal-blue mt-1 h-8 w-1 shrink-0 rounded-full" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {count} {noun}
            {count === 1 ? "" : "s"} selected
          </p>
          {description ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {onClear ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClear} className="inline-flex">
            <X className="h-3.5 w-3.5" />
            Clear selection
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ResponsiveFilterBar({
  renderFilters,
  activeCount = 0,
  mobileLabel = "Filters",
  className,
  desktopVisible = true,
}: {
  renderFilters: () => ReactNode;
  activeCount?: number;
  mobileLabel?: string;
  className?: string;
  desktopVisible?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          desktopVisible
            ? "dashboard-filter-controls hidden min-w-0 items-end gap-2 xl:flex"
            : "hidden",
          className,
        )}
        aria-label={mobileLabel}
      >
        {renderFilters()}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="xl:hidden"
        onClick={() => setOpen(true)}
        aria-label={`${mobileLabel}${activeCount > 0 ? `, ${activeCount} active` : ""}`}
      >
        <Filter className="h-4 w-4" />
        {mobileLabel}
        {activeCount > 0 ? (
          <span className="bg-signal-blue/15 text-signal-blue rounded-sm px-1.5 font-mono text-[10px]">
            {activeCount}
          </span>
        ) : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bottom-0 top-auto max-h-[82vh] w-full max-w-none translate-y-0 rounded-b-none rounded-t-md p-0 xl:hidden">
          <DialogHeader className="border-border border-b px-5 py-4 text-left">
            <DialogTitle>{mobileLabel}</DialogTitle>
          </DialogHeader>
          <div className="scroll-soft flex flex-col gap-3 overflow-y-auto p-5 [&>*]:w-full">
            {renderFilters()}
          </div>
          <div className="border-border bg-card sticky bottom-0 border-t p-4">
            <Button variant="signal" className="w-full" onClick={() => setOpen(false)}>
              Show results
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdvancedSettings({
  title = "Advanced settings",
  description,
  children,
  defaultOpen = false,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="border-border bg-muted/15 group rounded-sm border" open={defaultOpen}>
      <summary className="focus-visible:ring-ring flex cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {description ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
          ) : null}
        </div>
        <ChevronDown className="text-muted-foreground h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-border border-t p-4">{children}</div>
    </details>
  );
}

export function DashboardUrlTabs({
  value,
  param = "tab",
  children,
  className,
}: {
  value: string;
  param?: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Tabs
      value={value}
      className={className}
      onValueChange={(nextValue) => {
        const params = new URLSearchParams(searchParams.toString());
        if (nextValue === "overview" || nextValue === "current") params.delete(param);
        else params.set(param, nextValue);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }}
    >
      {children}
    </Tabs>
  );
}
