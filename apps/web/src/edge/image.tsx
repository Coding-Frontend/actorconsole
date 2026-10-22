import type { ImgHTMLAttributes } from "react";

export default function Image({
  src,
  alt = "",
  fill,
  priority,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) {
  // Static public images never call the Next.js image optimization server.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      src={
        typeof src === "string" && src.startsWith("/api/")
          ? `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}${src.slice(4)}`
          : src
      }
      loading={priority ? "eager" : "lazy"}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : props.style}
    />
  );
}
