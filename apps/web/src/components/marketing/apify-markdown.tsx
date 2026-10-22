"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

export function ApifyMarkdown({ markdown }: { markdown: string }) {
  return (
    <article className="actor-readme text-foreground max-w-none break-words text-[15px] leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          h1: heading("h1", "mt-0 text-3xl sm:text-4xl"),
          h2: heading("h2", "mt-10 border-b border-border pb-3 text-2xl sm:text-3xl"),
          h3: heading("h3", "mt-8 text-xl sm:text-2xl"),
          h4: heading("h4", "mt-7 text-lg sm:text-xl"),
          h5: heading("h5", "mt-6 text-base"),
          h6: heading("h6", "mt-6 text-sm"),
          p: ({ children }) => <p className="text-muted-foreground my-4 leading-7">{children}</p>,
          a: ({ href, children }) => {
            const external = Boolean(href && /^https?:\/\//i.test(href));
            return (
              <a
                href={href}
                className="text-signal-blue decoration-signal-blue/45 font-medium underline underline-offset-4 hover:decoration-current"
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                {children}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-signal-blue bg-signal-blue/5 text-muted-foreground my-6 border-l-4 px-5 py-2 italic">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className="text-muted-foreground my-5 list-disc space-y-2 pl-6 marker:text-signal-orange">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="text-muted-foreground my-5 list-decimal space-y-2 pl-6 marker:font-mono marker:text-signal-orange">
              {children}
            </ol>
          ),
          li: ({ children, className }) => (
            <li className={`pl-1 leading-7 ${className ?? ""}`}>{children}</li>
          ),
          input: ({ type, ...props }) =>
            type === "checkbox" ? (
              <input
                type="checkbox"
                className="border-border accent-signal-orange mr-2 h-4 w-4 align-[-2px]"
                {...props}
                disabled
              />
            ) : (
              <input type={type} {...props} />
            ),
          hr: () => <hr className="border-border my-10" />,
          table: ({ children }) => (
            <div className="border-border my-7 overflow-x-auto border">
              <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-border divide-y">{children}</tbody>,
          tr: ({ children }) => <tr className="transition-colors hover:bg-muted/25">{children}</tr>,
          th: ({ children }) => (
            <th className="border-border border-b border-r px-4 py-3 font-semibold last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-border text-muted-foreground border-r px-4 py-3 align-top leading-6 last:border-r-0">
              {children}
            </td>
          ),
          pre: ({ children }) => (
            <pre className="border-border bg-ink text-paper my-6 max-w-full overflow-x-auto border p-4 font-mono text-xs leading-6 sm:p-5">
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            const block = Boolean(className?.startsWith("language-"));
            return block ? (
              <code className={className} {...props}>
                {children}
              </code>
            ) : (
              <code
                className="border-border bg-muted/60 text-signal-orange rounded-sm border px-1.5 py-0.5 font-mono text-[0.88em]"
                {...props}
              >
                {children}
              </code>
            );
          },
          img: ({ src, alt }) => (
            // Apify READMEs commonly use screenshots and workflow diagrams.
            // Native images preserve animated assets and avoid rewriting
            // arbitrary third-party Markdown URLs through Next Image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt ?? ""}
              loading="lazy"
              className="border-border bg-muted/20 my-7 h-auto max-w-full rounded-md border object-contain"
            />
          ),
          del: ({ children }) => <del className="text-muted-foreground">{children}</del>,
          strong: ({ children }) => (
            <strong className="text-foreground font-semibold">{children}</strong>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

function heading(
  Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
  size: string,
) {
  return function MarkdownHeading({
    children,
    ...props
  }: ComponentPropsWithoutRef<typeof Tag>) {
    const id = slugify(textContent(children));
    return (
      <Tag
        id={id || undefined}
        className={`font-display-tight text-foreground group scroll-mt-28 font-semibold leading-tight ${size}`}
        {...props}
      >
        <a href={id ? `#${id}` : undefined} className="text-inherit no-underline">
          {children}
          {id ? (
            <span
              aria-hidden="true"
              className="text-muted-foreground ml-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              #
            </span>
          ) : null}
        </a>
      </Tag>
    );
  };
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textContent((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function slugify(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
