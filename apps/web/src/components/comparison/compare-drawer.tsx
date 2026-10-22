"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";

export function CompareDrawer({
  open,
  onOpenChange,
  title,
  description,
  count,
  fullHref,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  count: number;
  fullHref?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/60 duration-200" />
        <DialogPrimitive.Content className="border-border bg-card text-card-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right fixed inset-y-0 right-0 z-50 flex w-[92vw] max-w-3xl flex-col border-l shadow-2xl duration-200 focus:outline-none">
          <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display-tight text-2xl">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm leading-6">
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring shrink-0 rounded p-2 focus-visible:outline-none focus-visible:ring-2"
              aria-label="Close comparison"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            {count < 2 ? (
              <p className="border-border bg-muted/30 mb-5 border px-4 py-3 text-sm">
                Select one more item to compare side by side. You can add up to five.
              </p>
            ) : null}
            {children}
          </div>
          <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-7">
            <span className="text-muted-foreground text-xs">{count} of 5 selected</span>
            {fullHref && count >= 1 ? (
              <Button asChild>
                <Link href={fullHref} onClick={() => onOpenChange(false)}>
                  Open full comparison <ArrowUpRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button disabled>Open full comparison</Button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
