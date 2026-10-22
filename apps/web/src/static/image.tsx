import type { ImgHTMLAttributes } from "react";
import { normalizeApiUrl } from "./requests";
export type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
};
export default function Image({
  src,
  alt = "",
  fill,
  priority,
  unoptimized: _unoptimized,
  quality: _quality,
  placeholder: _placeholder,
  blurDataURL: _blur,
  loader: _loader,
  style,
  ...props
}: ImageProps) {
  // Pages serves static assets; this adapter cannot use the Next.js image server.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      src={normalizeApiUrl(typeof src === "string" ? src : src.src)}
      loading={priority ? "eager" : (props.loading ?? "lazy")}
      decoding="async"
      style={
        fill ? { position: "absolute", height: "100%", width: "100%", inset: 0, ...style } : style
      }
    />
  );
}
