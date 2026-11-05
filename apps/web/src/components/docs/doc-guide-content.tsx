import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DOC_GUIDES as docItems,
  DOC_GROUPS as docGroups,
  type DocGuide,
} from "@/lib/documentation";
import { DocArticle } from "./doc-article";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl, breadcrumbStructuredData } from "@/lib/seo";

export function DocGuideContent({ guide: activeDocItem }: { guide: DocGuide }) {
  const activeIndex = docItems.findIndex((item) => item.id === activeDocItem.id);
  const activeGroup =
    docGroups.find((group) => group.items.some((item) => item.id === activeDocItem.id))?.label ??
    "Documentation";
  const previousDoc = activeIndex > 0 ? docItems[activeIndex - 1] : undefined;
  const nextDoc = activeIndex < docItems.length - 1 ? docItems[activeIndex + 1] : undefined;
  const path = activeDocItem.id === "getting-started" ? "/docs" : `/docs/${activeDocItem.id}`;

  return (
    <section id="docs-main-panel" className="docs-main-panel min-w-0">
      <JsonLd
        data={breadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: "Documentation", path: "/docs" },
          ...(path === "/docs" ? [] : [{ name: activeDocItem.title, path }]),
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          "@id": absoluteUrl(`${path}#article`),
          mainEntityOfPage: absoluteUrl(path),
          headline: activeDocItem.title,
          description: activeDocItem.summary,
          articleSection: activeGroup,
          inLanguage: "en",
          publisher: {
            "@id": absoluteUrl("/#organization"),
            "@type": "Organization",
            name: "ActorConsole",
          },
          isPartOf: { "@id": absoluteUrl("/#website") },
        }}
      />
      <div>
        <div className="docs-article-header flex items-start gap-4">
          <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-[11px] text-muted-foreground">
            {String(activeIndex + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-signal-orange">
              {activeGroup} / guide {activeIndex + 1} of {docItems.length}
            </p>
            <h1 className="font-display-tight mt-4 text-4xl leading-[1.04] tracking-[-0.04em] text-foreground sm:text-5xl">
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
                href={previousDoc.id === "getting-started" ? "/docs" : `/docs/${previousDoc.id}`}
                className="group text-left text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-orange"
              >
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                  <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                  Previous guide
                </span>
                <span className="mt-2 block text-sm font-medium text-foreground">
                  {previousDoc.title}
                </span>
              </Link>
            ) : null}
            {nextDoc ? (
              <Link
                href={`/docs/${nextDoc.id}`}
                className="group text-right text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-orange"
              >
                <span className="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                  Next guide
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-2 block text-sm font-medium text-foreground">
                  {nextDoc.title}
                </span>
              </Link>
            ) : null}
          </nav>

          <div className="docs-help flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Need more help?{" "}
              <Link href="/contact" className="font-medium text-signal-orange hover:underline">
                Contact support
              </Link>
            </span>
            <Link href="/signup" className="font-medium text-foreground hover:underline">
              Get started free
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
