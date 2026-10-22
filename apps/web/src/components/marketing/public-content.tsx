import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One rail owner for every public render path, including pending/error views. */
export function PublicContent({
  children,
  as: Element = "div",
  className,
}: {
  children?: ReactNode;
  as?: "div" | "main";
  className?: string;
}) {
  return (
    <Element className={cn("marketing-content min-w-0 flex-1", className)}>{children}</Element>
  );
}
