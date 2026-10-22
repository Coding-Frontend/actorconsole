"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Filter,
  Globe,
  Rss,
  Sparkles,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CHANGELOG_CATEGORIES, tagLabel } from "@/lib/changelog";
import { ChangelogRow } from "./changelog-article";
import type { ChangelogListing } from "@/services/changelog";
import { PublicGridSection } from "./public-grid-section";

const categories = [
  { value: "", label: "All", icon: Globe },
  { value: "RELEASE", label: "New releases", icon: Sparkles },
  { value: "IMPROVEMENT", label: "Improvements", icon: Wrench },
  { value: "RETIRED", label: "Retired", icon: TriangleAlert },
];

export function ChangelogList({ data, query }: { data: ChangelogListing; query: string }) {
  const router = useRouter();
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const params = new URLSearchParams(query);
  const selectedTags = params.getAll("tag");
  const selectedCategory = params.get("category") ?? "";
  const selectedMonth = params.get("month");
  const [draftTags, setDraftTags] = useState(selectedTags);
  const [draftMatch, setDraftMatch] = useState(params.get("match") ?? "any");
  const [copyMessage, setCopyMessage] = useState("");
  const href = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(query);
    next.set("year", String(data.year));
    change(next);
    return `/changelog?${next}`;
  };
  const navigate = (change: (next: URLSearchParams) => void) =>
    startTransition(() => router.push(href(change), { scroll: false }));
  const resetPage = (next: URLSearchParams) => {
    next.delete("page");
    next.delete("month");
  };
  const visibleMonths = selectedMonth
    ? data.months.filter(({ month }) => Number(month.slice(5)) === Number(selectedMonth))
    : data.months;
  const latestVisibleMonth = data.items[0]?.releaseDate.slice(0, 7);
  const filtered = Boolean(selectedCategory || selectedTags.length || selectedMonth);

  return (
    <PublicGridSection frameClassName="pb-20 pt-12 sm:pt-20">
      <div className="mx-auto max-w-4xl">
        <div className="border-border flex flex-col justify-between gap-6 border-b pb-8 sm:flex-row sm:items-end">
          <div>
            <p className="text-signal-orange mb-3 font-mono text-xs uppercase tracking-[0.18em]">
              ActorConsole / Updates
            </p>
            <h1 className="font-display-tight text-4xl font-semibold tracking-tight sm:text-5xl">
              Changelog<span className="text-signal-orange">_</span>
            </h1>
            <p className="text-muted-foreground mt-4 max-w-md text-sm leading-relaxed">
              New features, useful improvements, and changes to the tools you build with.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* RSS is an XML document and should use normal browser navigation. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/changelog/feed"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-2 rounded-sm font-mono text-xs focus-visible:outline-none focus-visible:ring-2"
            >
              <Rss className="h-4 w-4" />
              RSS feed
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    new URL("/changelog/feed", window.location.origin).href,
                  );
                  setCopyMessage("Feed URL copied");
                } catch {
                  setCopyMessage("Open the RSS feed to copy its address.");
                }
              }}
            >
              Copy feed URL
            </Button>
            <span role="status" className="text-muted-foreground text-xs">
              {copyMessage}
            </span>
          </div>
        </div>

        <nav
          className="border-border flex flex-wrap items-center justify-between gap-3 border-b py-5"
          aria-label="Changelog categories"
        >
          <div className="flex flex-wrap gap-1">
            {categories.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={selectedCategory === value ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={selectedCategory === value}
                disabled={pending}
                onClick={() =>
                  navigate((next) => {
                    if (value) next.set("category", value);
                    else next.delete("category");
                    resetPage(next);
                  })
                }
              >
                <Icon className="mr-2 h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
          <Button
            ref={filterButtonRef}
            variant="outline"
            size="sm"
            onClick={() => {
              setDraftTags(selectedTags);
              setDraftMatch(params.get("match") ?? "any");
              setDialogOpen(true);
            }}
          >
            <Filter className="mr-2 h-3.5 w-3.5" />
            Filters{selectedTags.length > 0 ? ` (${selectedTags.length})` : ""}
          </Button>
        </nav>
        {filtered && (
          <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {selectedCategory && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                aria-label="Remove category filter"
                onClick={() =>
                  navigate((next) => {
                    next.delete("category");
                    resetPage(next);
                  })
                }
              >
                {CHANGELOG_CATEGORIES[selectedCategory as keyof typeof CHANGELOG_CATEGORIES].label}
                <X className="ml-2 h-3 w-3" />
              </Button>
            )}
            {selectedTags.map((tag) => (
              <Button
                key={tag}
                variant="outline"
                size="sm"
                disabled={pending}
                aria-label={`Remove ${tagLabel(tag)} filter`}
                onClick={() =>
                  navigate((next) => {
                    next.delete("tag");
                    selectedTags
                      .filter((value) => value !== tag)
                      .forEach((value) => next.append("tag", value));
                    resetPage(next);
                  })
                }
              >
                {tagLabel(tag)}
                <X className="ml-2 h-3 w-3" />
              </Button>
            ))}
            {selectedMonth && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => navigate((next) => resetPage(next))}
              >
                Month {selectedMonth}
                <X className="ml-2 h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                navigate((next) => {
                  ["category", "tag", "match", "month", "page"].forEach((key) => next.delete(key));
                })
              }
            >
              Clear filters
            </Button>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-4">
          <p className="text-muted-foreground font-mono text-xs" role="status">
            {pending
              ? "Loading updates…"
              : `${data.total} update${data.total === 1 ? "" : "s"}${selectedMonth ? " this month" : " this year"}`}
          </p>
          <label className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
            Year
            <select
              aria-label="Changelog year"
              className="border-border bg-card text-foreground focus-visible:ring-ring rounded-sm border px-3 py-2 focus-visible:outline-none focus-visible:ring-2"
              value={data.year}
              disabled={pending}
              onChange={(event) =>
                navigate((next) => {
                  next.set("year", event.target.value);
                  resetPage(next);
                })
              }
            >
              {[...new Set([data.year, ...data.years])]
                .sort((a, b) => b - a)
                .map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div aria-busy={pending} className={pending ? "opacity-60" : ""}>
          {data.total === 0 ? (
            <div className="border-border mt-8 border-y py-16 text-center">
              <h2 className="text-lg font-semibold">
                {filtered ? "No matching updates" : "No updates published yet"}
              </h2>
              <p className="text-muted-foreground mt-3 text-sm">
                {filtered
                  ? "Try another category, product area, or year."
                  : "Check back here for the latest ActorConsole releases."}
              </p>
            </div>
          ) : (
            visibleMonths.map(({ month, count }) => {
              const entries = data.items.filter((entry) => entry.releaseDate.startsWith(month));
              const label = new Intl.DateTimeFormat("en-US", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${month}-01T00:00:00Z`));
              return (
                <details
                  key={`${query}-${month}`}
                  open={month === latestVisibleMonth}
                  className="border-border group mt-9 border-b pb-4"
                >
                  <summary className="focus-visible:ring-ring flex cursor-pointer list-none items-center gap-3 rounded-sm py-3 focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
                    <h2 className="font-display-tight text-2xl font-semibold tracking-tight">
                      {label}
                    </h2>
                    <span className="text-muted-foreground font-mono text-xs">{count}</span>
                    <ArrowDown className="text-muted-foreground ml-auto h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  {entries.map((entry) => (
                    <ChangelogRow key={entry.id} entry={entry} />
                  ))}
                  {entries.length < count && (
                    <Link
                      className="text-signal-blue focus-visible:ring-ring mt-4 inline-block rounded-sm text-sm underline underline-offset-4 focus-visible:ring-2"
                      href={href((next) => {
                        next.set("month", String(Number(month.slice(5))));
                        next.delete("page");
                      })}
                    >
                      Browse all {count} updates from {label}
                    </Link>
                  )}
                </details>
              );
            })
          )}
        </div>

        {data.total > data.limit && (
          <nav
            aria-label="Changelog pages"
            className="border-border mt-8 flex items-center justify-between gap-3 border-t pt-6"
          >
            <span className="text-muted-foreground font-mono text-xs">
              Page {data.page} of {Math.ceil(data.total / data.limit)}
            </span>
            <div className="flex gap-3">
              {data.page > 1 && (
                <Link
                  className="focus-visible:ring-ring inline-flex items-center gap-2 rounded-sm text-sm underline underline-offset-4 focus-visible:ring-2"
                  href={href((next) => next.set("page", String(data.page - 1)))}
                >
                  <ArrowLeft className="h-3 w-3" />
                  Previous
                </Link>
              )}
              {data.page * data.limit < data.total && (
                <Link
                  className="focus-visible:ring-ring inline-flex items-center gap-2 rounded-sm text-sm underline underline-offset-4 focus-visible:ring-2"
                  href={href((next) => next.set("page", String(data.page + 1)))}
                >
                  Next
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </nav>
        )}

        {data.years.length > 1 && (
          <nav
            aria-label="Changelog archive years"
            className="border-border mt-12 flex flex-wrap justify-center gap-4 border-t pt-6"
          >
            {data.years.map((year) => (
              <Link
                key={year}
                aria-current={year === data.year ? "page" : undefined}
                href={href((next) => {
                  next.set("year", String(year));
                  resetPage(next);
                })}
                className={`focus-visible:ring-ring rounded-sm font-mono text-sm underline-offset-4 hover:underline focus-visible:ring-2 ${year === data.year ? "text-foreground font-bold" : "text-muted-foreground"}`}
              >
                {year}
              </Link>
            ))}
          </nav>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent
            className="max-w-lg"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              filterButtonRef.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Filter by product area</DialogTitle>
              <DialogDescription>Choose the tools you want to follow.</DialogDescription>
            </DialogHeader>
            <fieldset>
              <legend className="mb-3 text-sm font-medium">Match selected areas</legend>
              <div className="flex gap-5">
                {["any", "all"].map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="tag-match"
                      value={value}
                      checked={draftMatch === value}
                      onChange={() => setDraftMatch(value)}
                      className="accent-signal-orange h-4 w-4"
                    />
                    {value === "any" ? "Any selected area" : "All selected areas"}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="border-border border-t pt-5">
              <legend className="px-1 text-sm font-medium">Product areas</legend>
              {data.tags.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Product areas will appear as tagged updates are published.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[...new Set([...data.tags, ...selectedTags])].map((tag) => (
                  <label
                    key={tag}
                    className="border-border flex items-center gap-3 rounded-sm border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={draftTags.includes(tag)}
                      onChange={(event) =>
                        setDraftTags((previous) =>
                          event.target.checked
                            ? [...previous, tag].slice(0, 12)
                            : previous.filter((value) => value !== tag),
                        )
                      }
                      className="accent-signal-orange h-4 w-4"
                    />
                    {tagLabel(tag)}
                  </label>
                ))}
              </div>
            </fieldset>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setDraftTags([]);
                  setDraftMatch("any");
                }}
              >
                Clear product areas
              </Button>
              <Button
                onClick={() => {
                  navigate((next) => {
                    next.delete("tag");
                    draftTags.forEach((tag) => next.append("tag", tag));
                    if (draftTags.length) next.set("match", draftMatch);
                    else next.delete("match");
                    resetPage(next);
                  });
                  setDialogOpen(false);
                }}
              >
                Apply filters
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PublicGridSection>
  );
}
