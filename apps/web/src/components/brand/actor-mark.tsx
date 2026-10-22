import Image, { type ImageProps } from "next/image";
import * as React from "react";
import { cn } from "@/lib/utils";

export type ActorMarkProps = Omit<ImageProps, "alt" | "height" | "src" | "width"> & {
  size?: number;
};

/** Shared image-backed mark used across the application shell and brand surfaces. */
export const ActorMark = React.forwardRef<HTMLImageElement, ActorMarkProps>(
  ({ className, size = 40, ...props }, ref) => (
    <Image
      {...props}
      ref={ref}
      aria-hidden="true"
      alt=""
      className={cn("shrink-0", className)}
      height={size}
      src="/logo.png"
      width={size}
    />
  ),
);

ActorMark.displayName = "ActorMark";
