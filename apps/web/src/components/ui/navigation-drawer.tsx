"use client";

import { useEffect, useRef, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "./dialog";
import { cn } from "@/lib/utils";

/** Mobile navigation shares the modal's focus, dismissal and scroll behavior. */
export function NavigationDrawer({
  open,
  onClose,
  title,
  children,
  className,
  overlayClassName,
  desktopQuery = "(min-width: 1024px)",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  desktopQuery?: string;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia(desktopQuery);
    const closeOnDesktop = () => {
      if (media.matches) onClose();
    };
    closeOnDesktop();
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [desktopQuery, onClose, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className={overlayClassName} />
        <DialogPrimitive.Content
          aria-modal="true"
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 left-0 z-[60] flex w-72 max-w-[calc(100vw-1rem)] flex-col border-r border-border bg-card shadow-2xl",
            className,
          )}
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus.current;
            if (target?.isConnected && target.getClientRects().length) target.focus();
          }}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
