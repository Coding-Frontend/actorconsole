"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type SelectRootProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>;

/**
 * Radix focuses the selected item when a menu opens. On long dashboard pages
 * that focus can scroll the document even when the trigger is already visible.
 * Keep the page anchored to the position where the user opened the menu.
 */
const Select = ({ onOpenChange, ...props }: SelectRootProps) => {
  const scrollPosition = React.useRef<{ x: number; y: number } | null>(null);

  const restoreScrollPosition = React.useCallback(() => {
    const saved = scrollPosition.current;
    if (!saved || typeof window === "undefined") return;

    if (Math.abs(window.scrollX - saved.x) > 0.5 || Math.abs(window.scrollY - saved.y) > 0.5) {
      window.scrollTo(saved.x, saved.y);
    }
  }, []);

  const restoreForFrames = React.useCallback(
    (frames: number) => {
      restoreScrollPosition();
      if (frames > 0 && typeof window !== "undefined") {
        window.requestAnimationFrame(() => restoreForFrames(frames - 1));
      }
    },
    [restoreScrollPosition],
  );

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && typeof window !== "undefined") {
        scrollPosition.current = { x: window.scrollX, y: window.scrollY };
      }

      onOpenChange?.(nextOpen);

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => restoreForFrames(nextOpen ? 10 : 3));
      }
    },
    [onOpenChange, restoreForFrames],
  );

  return <SelectPrimitive.Root {...props} onOpenChange={handleOpenChange} />;
};
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "border-input bg-card text-card-foreground focus-visible:border-ring focus-visible:ring-ring flex h-12 w-full items-center justify-between gap-3 rounded-md border px-4 text-left text-sm font-semibold shadow-sm outline-none transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" aria-hidden="true" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" aria-hidden="true" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, collisionPadding = 8, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      collisionPadding={collisionPadding}
      className={cn(
        "border-border bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 z-[100] max-h-[min(20rem,calc(100vh-1rem))] min-w-[8rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-md border shadow-xl",
        position === "popper" &&
          "w-[var(--radix-select-trigger-width)] max-w-[var(--radix-popper-available-width)] data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "min-h-0 p-1",
          position === "popper" &&
            "max-h-[min(20rem,calc(100vh-1rem))] w-full min-w-0",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      "text-signal-blue min-w-0 truncate px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em]",
      className,
    )}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "focus:bg-accent focus:text-accent-foreground data-[state=checked]:bg-signal-blue/10 data-[state=checked]:text-signal-blue relative flex w-full min-w-0 cursor-default select-none items-center rounded-sm py-2.5 pl-9 pr-3 text-sm font-medium outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-3 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("bg-border -mx-1 my-1 h-px", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
