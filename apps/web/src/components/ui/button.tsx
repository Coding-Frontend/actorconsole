import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * ActorConsole button system.
 *
 * - compact square radius keeps actions closer to a workbench than a SaaS pill
 * - Filled: Carbon #202020 background, white text, Inter weight 500-600
 * - Outline: 1px Carbon border, transparent background, Carbon text
 * - Crisp borders and compact geometry; no elevation
 * - Signal Orange is reserved for chart fills / data accents — never
 *   used as a button background
 */
const buttonVariants = cva(
  "workbench-control inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-sans text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Filled workbench action.
        default:
          "border border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90",
        signal:
          "border border-signal-orange bg-signal-orange text-primary shadow-none hover:bg-signal-orange/90",
        // Inverted: foreground on primary (for inverted sections)
        inverted:
          "border border-primary-foreground/20 bg-primary-foreground text-primary shadow-none hover:bg-primary-foreground/90",
        // Outlined workbench action.
        outline:
          "border border-input bg-card text-card-foreground shadow-none hover:border-ring/60 hover:bg-accent hover:text-accent-foreground",
        // Ghost — text only with hover wash
        ghost: "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        // Plain text link
        link: "h-auto rounded-sm p-0 text-foreground underline-offset-4 hover:text-signal-orange hover:underline",
        // Legacy aliases collapsed to ActorConsole ink
        destructive:
          "border border-destructive bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90",
        secondary:
          "border border-border bg-secondary text-secondary-foreground shadow-none hover:border-input hover:bg-secondary/75",
        gradient:
          "border border-primary bg-primary text-primary-foreground shadow-none hover:bg-primary/90",
      },
      size: {
        default: "h-10 rounded-sm px-5 text-[14px]",
        sm: "h-9 rounded-sm px-4 text-sm",
        lg: "h-12 rounded-sm px-6 text-[15px]",
        icon: "h-10 w-10 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
