import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DOC_GUIDES as docItems,
  DOC_GROUPS as docGroups,
  type DocGuide,
} from "@/lib/documentation";
import { DocArticle } from "./doc-article";

export function DocGuideContent({ guide: activeDocItem }: { guide: DocGuide }) {
  const activeIndex = docItems.findIndex((item) => item.id === activeDocItem.id);
  const activeGroup =
    docGroups.find((group) => group.items.some((item) => item.id === activeDocItem.id))?.label ??
    "Documentation";
  const previousDoc = activeIndex > 0 ? docItems[activeIndex - 1] : undefined;
  const nextDoc = activeIndex < docItems.length - 1 ? docItems[activeIndex + 1] : undefined;

  return (
    <section id="docs-main-panel" className="docs-main-panel min-w-0">
      <div>
        <div className="docs-article-header flex items-start gap-4">
          <span className="text-muted-foreground border-border bg-card mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]">
            {String(activeIndex + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="text-signal-orange font-mono text-[10px] font-medium uppercase tracking-[0.18em]">
              {activeGroup} / guide {activeIndex + 1} of {docItems.length}
            </p>
            <h1 className="text-foreground font-display-tight mt-4 text-4xl leading-[1.04] tracking-[-0.04em] sm:text-5xl">
              {activeDocItem.title}
            </h1>
          </div>
        </div>

        <div className="docs-reading">
          <div className="docs-content">
            <DocArticle key={activeDocItem.id} guide={activeDocItem} />
          </div>

          <nav
            aria-label="Guide navigation"
            className={cn("docs-pagination grid", previousDoc && nextDoc && "sm:grid-cols-2")}
          >
            {previousDoc ? (
              <Link
                href={`/docs/${previousDoc.id}`}
                className="focus-visible:ring-signal-orange text-muted-foreground hover:bg-accent group text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
              >
                <span className="text-muted-foreground/80 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
                  <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                  Previous guide
                </span>
                <span className="text-foreground mt-2 block text-sm font-medium">
                  {previousDoc.title}
                </span>
              </Link>
            ) : null}
            {nextDoc ? (
              <Link
                href={`/docs/${nextDoc.id}`}
                className="focus-visible:ring-signal-orange text-muted-foreground hover:bg-accent group text-right transition-colors focus-visible:outline-none focus-visible:ring-2"
              >
                <span className="text-muted-foreground/80 flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
                  Next guide
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="text-foreground mt-2 block text-sm font-medium">
                  {nextDoc.title}
                </span>
              </Link>
            ) : null}
          </nav>

          <div className="docs-help text-muted-foreground flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <span>
              Need more help?{" "}
              <Link href="/contact" className="text-signal-orange font-medium hover:underline">
                Contact support
              </Link>
            </span>
            <Link href="/signup" className="text-foreground font-medium hover:underline">
              Get started free
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
