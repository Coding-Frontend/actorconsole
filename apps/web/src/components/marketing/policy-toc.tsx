"use client";

import Link from "next/link";
import { useMemo } from "react";
import { policyHeadingId } from "@/components/marketing/policy-heading";

export function PolicyToc({ body }: { body: string }) {
  const headings = useMemo(() => {
    return body
      .split(/\r?\n/)
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3).trim())
      .map((title) => ({ title, id: policyHeadingId(title) }));
  }, [body]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-[0.14em]">
        On this page
      </p>
      <ul className="border-border space-y-1 border-l pl-3">
        {headings.map((h) => (
          <li key={h.id}>
            <Link
              href={`#${h.id}`}
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:ring-ring block rounded-sm px-2 py-1.5 leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              {h.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
