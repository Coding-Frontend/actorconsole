import type { ComponentProps } from "react";
import { HomeGridSection } from "./home-grid";
import { cn } from "@/lib/utils";

/** The public catalog and tools share the marketing frame, gutters, and rails. */
export function PublicGridSection({
  frameClassName,
  ...props
}: ComponentProps<typeof HomeGridSection>) {
  return (
    <HomeGridSection
      frameClassName={cn("min-w-0 px-6 py-8 sm:px-8 sm:py-10 lg:p-12", frameClassName)}
      {...props}
    />
  );
}
