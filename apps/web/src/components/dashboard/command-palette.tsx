"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useId } from "react";
import { useRouter } from "next/navigation";
import { Search, CalendarClock, LifeBuoy, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  accountNavigation,
  visibleDashboardNavigation,
} from "@/components/dashboard/dashboard-navigation";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  href?: string;
  icon: React.ReactNode;
  shortcut?: string;
  category: string;
  action?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  workspaceRestricted?: boolean;
  workspacePlan?: "FREE" | "PRO";
}

export function CommandPalette({
  open,
  onClose,
  workspaceRestricted = false,
  workspacePlan = "FREE",
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const resultsId = useId();

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Navigation items (always available)
  const navItems: CommandItem[] = useMemo(
    () => [
      ...visibleDashboardNavigation(workspaceRestricted).flatMap((group) =>
        group.items.map((item) => {
          const Icon = item.icon;
          const restricted = item.minimumPlan === "PRO" && workspacePlan === "FREE";
          return {
            id: item.id,
            label: item.label,
            description: restricted ? "Upgrade the active workspace to Pro" : undefined,
            href: restricted ? "/dashboard/billing" : item.href,
            icon: <Icon className="h-4 w-4" />,
            category: group.label,
          };
        }),
      ),
      ...accountNavigation.map((item) => ({
        id: item.id,
        label: item.label,
        href: item.href,
        icon: <item.icon className="h-4 w-4" />,
        category: "Account",
      })),
    ],
    [workspacePlan, workspaceRestricted],
  );

  // Quick actions
  const quickActions: CommandItem[] = useMemo(
    () => [
      ...(!workspaceRestricted
        ? [
            {
              id: "new-publishing-schedule",
              label: "New publishing schedule",
              description: "Create a recurring workspace publishing queue",
              icon: <CalendarClock className="h-4 w-4" />,
              category: "Actions",
              action: () => router.push("/dashboard/publishing/schedules/new"),
            },
          ]
        : []),
      {
        id: "new-ticket",
        label: "Open support ticket",
        description: "Get help from the team",
        icon: <LifeBuoy className="h-4 w-4" />,
        category: "Actions",
        action: () => router.push("/dashboard/support/new"),
      },
    ],
    [router, workspaceRestricted],
  );

  const allItems = useMemo(() => [...navItems, ...quickActions], [navItems, quickActions]);

  // Filter items based on query
  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  }, [query, allItems]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, Math.min(prev + 1, filtered.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        const item = filtered[selectedIndex];
        if (item.action) {
          item.action();
        } else if (item.href) {
          router.push(item.href);
        }
        onClose();
      }
    },
    [filtered, selectedIndex, router, onClose],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector<HTMLElement>(`[data-command-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, query, open]);

  // Group filtered items by category
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [filtered]);

  let itemIndex = -1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="border-border/60 top-[15vh] max-h-[calc(85dvh-1rem)] max-w-lg translate-y-0 gap-0 rounded-xl p-0 shadow-2xl sm:p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = openerRef.current;
          if (opener?.isConnected && opener.getClientRects().length) opener.focus();
        }}
      >
        <DialogTitle className="sr-only">Search workspace</DialogTitle>
        <DialogDescription className="sr-only">Search pages, actions and settings. Use arrow keys to navigate and Enter to open a result.</DialogDescription>
        {/* Search input */}
        <div className="border-border/40 flex items-center gap-3 border-b py-3 pl-4 pr-14">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search pages, actions and settings"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={resultsId}
            aria-activedescendant={filtered[selectedIndex] ? `${resultsId}-${selectedIndex}` : undefined}
            autoComplete="off"
            placeholder="Search pages, actions, settings…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="border-border/40 bg-muted/50 text-muted-foreground/60 hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} id={resultsId} role="listbox" aria-label="Workspace pages and actions" className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center py-8 text-sm">
              <Search className="text-muted-foreground/30 mb-2 h-6 w-6" />
              <p>No results for &ldquo;{query}&rdquo;</p>
              <p className="text-muted-foreground/50 text-xs">Try a different search term</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} role="group" aria-label={category}>
                <p className="text-muted-foreground/60 px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider first:pt-0">
                  {category}
                </p>
                {items.map((item) => {
                  itemIndex++;
                  const idx = itemIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      id={`${resultsId}-${idx}`}
                      data-command-index={idx}
                      role="option"
                      aria-selected={idx === selectedIndex}
                      tabIndex={-1}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors",
                        idx === selectedIndex
                          ? "bg-signal-orange/10 text-signal-orange"
                          : "text-foreground hover:bg-accent",
                      )}
                      onClick={() => {
                        if (item.action) item.action();
                        else if (item.href) router.push(item.href);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                          idx === selectedIndex
                            ? "bg-signal-orange/15 text-signal-orange"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.label}</p>
                        {item.description && (
                          <p className="text-muted-foreground truncate text-xs">
                            {item.description}
                          </p>
                        )}
                      </div>
                      {item.href && (
                        <ArrowRight className="text-muted-foreground/40 h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="border-border/40 text-muted-foreground/50 flex items-center gap-4 border-t px-4 py-2 text-[10px]">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to manage command palette state globally.
 * Call `useCommandPalette()` in your layout and render `<CommandPalette>`.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      // Slash key to open (when not in an input)
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}
