"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  DOC_GUIDES as docItems,
  DOC_GROUPS as docGroups,
  searchDocGuides,
} from "@/lib/documentation";
import { BookOpen, ChevronDown, Search } from "lucide-react";

export function DocsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  const routeSection = pathname.startsWith("/docs/")
    ? pathname.slice("/docs/".length).split("/")[0]
    : "getting-started";
  const activeSection = docItems.some((item) => item.id === routeSection)
    ? routeSection
    : "getting-started";

  // Reset the reading position when a guide route changes.
  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
        searchTrigger.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [searchOpen]);

  const activeDocItem = docItems.find((item) => item.id === activeSection) ?? docItems[0];
  const activeGroup =
    docGroups.find((group) => group.items.some((item) => item.id === activeDocItem.id))?.label ??
    "Documentation";
  const searchResults = searchQuery.trim() ? searchDocGuides(searchQuery) : [];

  const handleSelect = (id: string) => {
    router.push(`/docs/${id}`);
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <main className="home-grid-section docs-shell flex min-h-screen flex-1 flex-col">
      <div className="home-grid-frame flex flex-1 flex-col lg:flex-row">
        <div className="docs-sidebar-column hidden lg:block lg:w-[280px] lg:shrink-0">
          <aside
            className="docs-sidebar lg:sticky lg:overflow-y-auto"
            aria-label="Documentation sections"
          >
            <div className="docs-sidebar-title flex items-center gap-2">
              <BookOpen className="text-signal-orange h-4 w-4" aria-hidden="true" />
              <span className="text-muted-foreground font-mono text-[10px] font-medium uppercase tracking-[0.18em]">
                Documentation
              </span>
            </div>
            <div className="px-5 py-6">
              <div className="space-y-6">
                {docGroups.map((group) => (
                  <details
                    key={group.label}
                    open={group.label === activeGroup || group.label === "Start here"}
                    className="group/section space-y-2"
                  >
                    <summary className="focus-visible:ring-signal-orange text-muted-foreground flex min-h-9 cursor-pointer list-none items-center justify-between rounded-sm px-3 text-[10px] font-semibold uppercase tracking-[0.2em] focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
                      {group.label}
                      <ChevronDown
                        className="text-muted-foreground/70 h-3.5 w-3.5 -rotate-90 transition-transform group-open/section:rotate-0"
                        aria-hidden="true"
                      />
                    </summary>
                    <ul className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = BookOpen;
                        const isActive = item.id === activeSection;
                        return (
                          <li key={item.id}>
                            <Link
                              href={`/docs/${item.id}`}
                              onClick={() => {
                                setSearchOpen(false);
                                setSearchQuery("");
                              }}
                              aria-current={isActive ? "page" : undefined}
                              className={cn(
                                "focus-visible:ring-signal-orange group flex min-h-10 w-full items-center gap-3 rounded-md border border-transparent px-3 text-left text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2",
                                isActive
                                  ? "border-border bg-card text-foreground"
                                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                              )}
                            >
                              <Icon
                                className={cn(
                                  "h-4 w-4 shrink-0 transition-colors",
                                  isActive
                                    ? "text-signal-orange"
                                    : "text-muted-foreground/70 group-hover:text-foreground",
                                )}
                                aria-hidden="true"
                              />
                              <span>{item.title}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div className="min-w-0 flex-1">
          <div className="docs-toolbar py-4">
            <div className="flex min-h-10 items-center justify-between gap-4">
              <nav aria-label="Breadcrumb" className="min-w-0">
                <ol className="flex min-w-0 items-center gap-2 text-xs">
                  <li>
                    <Link
                      href="/docs"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Docs
                    </Link>
                  </li>
                  <li className="text-muted-foreground/50" aria-hidden="true">
                    /
                  </li>
                  <li className="text-muted-foreground">{activeGroup}</li>
                  <li className="text-muted-foreground/50" aria-hidden="true">
                    /
                  </li>
                  <li className="text-foreground flex min-w-0 items-center gap-2 font-medium">
                    <BookOpen
                      className="text-signal-orange h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">{activeDocItem.title}</span>
                  </li>
                </ol>
              </nav>

              <button
                ref={searchTrigger}
                type="button"
                onClick={() => setSearchOpen((open) => !open)}
                aria-label={searchOpen ? "Close docs search" : "Search docs"}
                aria-expanded={searchOpen}
                aria-controls="docs-search-panel"
                className="focus-visible:ring-signal-orange text-muted-foreground hover:border-input hover:text-foreground border-border bg-card inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Search docs</span>
                <kbd className="text-muted-foreground border-border bg-accent hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
                  ⌘K
                </kbd>
              </button>
            </div>

            {searchOpen && (
              <div id="docs-search-panel" className="relative mt-3">
                <div className="border-border bg-card flex items-center gap-2 rounded-md border px-3">
                  <Search className="text-signal-orange h-4 w-4 shrink-0" aria-hidden="true" />
                  <input
                    ref={searchInput}
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search documentation"
                    aria-label="Search documentation"
                    className="text-foreground placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <kbd className="text-muted-foreground border-border rounded border px-1.5 py-0.5 font-mono text-[10px]">
                    Esc
                  </kbd>
                </div>
                {searchQuery.trim() && (
                  <div className="border-border bg-popover absolute inset-x-0 top-14 z-10 max-h-80 overflow-y-auto rounded-md border p-1.5 shadow-2xl">
                    {searchResults.length > 0 ? (
                      searchResults.map((item) => (
                        <Link
                          key={item.id}
                          href={`/docs/${item.id}`}
                          onClick={() => {
                            setSearchOpen(false);
                            setSearchQuery("");
                          }}
                          className="focus-visible:ring-signal-orange text-muted-foreground hover:bg-accent hover:text-foreground flex min-h-10 w-full items-center gap-3 rounded-sm px-3 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2"
                        >
                          <BookOpen className="text-signal-orange h-3.5 w-3.5" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="text-foreground block font-medium">{item.title}</span>
                            <span className="mt-1 line-clamp-2 block leading-relaxed">
                              {item.summary}
                            </span>
                          </span>
                        </Link>
                      ))
                    ) : (
                      <p className="text-muted-foreground px-3 py-3 text-xs">No matching guides.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="docs-mobile-nav py-3 lg:hidden">
            <label htmlFor="docs-mobile-nav" className="sr-only">
              Jump to a documentation section
            </label>
            <select
              id="docs-mobile-nav"
              value={activeSection}
              onChange={(event) => handleSelect(event.target.value)}
              className="focus:border-signal-orange focus:ring-signal-orange/30 text-foreground border-border bg-card min-h-11 w-full rounded-md border px-3 text-xs font-medium outline-none focus:ring-2"
            >
              {docGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {children}
        </div>
      </div>
    </main>
  );
}
