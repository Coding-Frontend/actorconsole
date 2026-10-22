"use client";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Comparison regions must be focusable for keyboard scrolling. */

import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { ArrowUpRight, ChevronDown, Plus, Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MetricValue, comparisonValuePresent, type ComparisonRow } from "./comparison-ui";
import { ComparisonCharts } from "./comparison-charts";
import { metricLeader } from "./comparison-chart-data";
import type { PublicCompareItem, PublicCompareKind } from "./public-comparison-items";

export function ComparisonWorkspace({
  items,
  rows,
  kind,
  window,
  searchControl,
  onRemove,
  onWindowChange,
  onSelectorChange,
}: {
  items: PublicCompareItem[];
  rows: ComparisonRow[];
  kind: PublicCompareKind;
  window: number;
  searchControl: ReactNode;
  onRemove: (id: string) => void;
  onWindowChange: (days: 7 | 30 | 90) => void;
  onSelectorChange: (id: string | null) => void;
}) {
  const [selector, setSelector] = useState<string | null>(null);
  const [highlightBest, setHighlightBest] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [completeOnly, setCompleteOnly] = useState(false);
  const selectionKey = items.map((item) => item.id).join("|");
  useEffect(() => setSelector(null), [selectionKey]);
  const headerScroll = useRef<HTMLDivElement>(null);
  const overviewScroll = useRef<HTMLDivElement>(null);
  const detailsScroll = useRef<HTMLDivElement>(null);
  const noun = kind === "actor" ? "Actor" : "builder";
  const count = Math.max(2, items.length);
  const minWidth = count * 270;
  const grid = { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };
  const groups = ["All", ...new Set(rows.map((row) => row.group))];
  const overviewKeys =
    kind === "builder"
      ? ["actorCount", "activeUsers", "recentRuns", "earningsCentral", "rank"]
      : ["description", "pricingModel", "activeUsers", "runs30Days", "rating"];
  const overviewRows = overviewKeys.flatMap((key) => rows.filter((row) => row.key === key));
  const visibleRows = rows.filter((row) => {
    if (group !== "All" && row.group !== group) return false;
    if (query && !`${row.label} ${row.group}`.toLowerCase().includes(query.toLowerCase()))
      return false;
    const values = items.map((item) => item.metrics[row.key]);
    if (completeOnly && values.some((value) => !comparisonValuePresent(value))) return false;
    if (
      differencesOnly &&
      items.length > 1 &&
      new Set(values.map((value) => JSON.stringify(value ?? null))).size < 2
    )
      return false;
    return true;
  });

  function syncScroll(event: UIEvent<HTMLDivElement>) {
    for (const ref of [headerScroll, overviewScroll, detailsScroll]) {
      if (ref.current && ref.current !== event.currentTarget)
        ref.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  }

  function picker(key: string, trigger: ReactNode, replacement: string | null = null) {
    return (
      <Popover.Root
        open={selector === key}
        onOpenChange={(open) => {
          setSelector(open ? key : null);
          onSelectorChange(open ? replacement : null);
        }}
      >
        <Popover.Trigger asChild>{trigger}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            collisionPadding={12}
            aria-label={`Select ${kind === "actor" ? "an Actor" : "a builder"}`}
            className="border-border bg-popover text-popover-foreground z-50 w-[min(400px,calc(100vw-24px))] rounded-xl border p-4"
          >
            <p className="mb-3 text-sm font-semibold">
              {replacement
                ? `Replace this ${noun}`
                : `Add ${kind === "actor" ? "an Actor" : "a builder"}`}
            </p>
            {searchControl}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  function metricRows(selectedRows: ComparisonRow[]) {
    return selectedRows.map((row) => {
      const best = highlightBest && row.better ? metricLeader(items, row.key, row.better) : null;
      return (
        <div key={row.key} className="border-border grid gap-3 border-b" style={grid}>
          {items.map((item) => (
            <div
              key={item.id}
              className="flex min-w-0 items-start justify-between gap-4 px-4 py-2.5 text-sm sm:px-5 sm:py-3.5"
            >
              <span className="text-muted-foreground min-w-0">{row.label}</span>
              <span
                className={`${typeof item.metrics[row.key] === "number" ? "shrink-0 whitespace-nowrap" : "min-w-0 max-w-[58%] break-words"} text-right font-medium tabular-nums ${best !== null && item.metrics[row.key] === best ? "text-signal-orange" : "text-foreground"}`}
                title={
                  best !== null && item.metrics[row.key] === best
                    ? `Leading value for ${row.label}`
                    : undefined
                }
              >
                <MetricValue value={item.metrics[row.key]} format={row.format} fullText />
              </span>
            </div>
          ))}
        </div>
      );
    });
  }

  return (
    <div className="space-y-6 sm:space-y-10">
      <div className="bg-background/95 sticky top-16 z-30 -mx-1 px-1 pb-3 pt-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-xs">Period</span>
            <div
              className="border-border flex rounded-lg border p-1"
              role="group"
              aria-label="Reporting period"
            >
              {([7, 30, 90] as const).map((days) => (
                <button
                  type="button"
                  key={days}
                  aria-pressed={days === window}
                  onClick={() => onWindowChange(days)}
                  className={`focus-visible:ring-ring rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 ${days === window ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Switch
                id="comparison-highlight"
                checked={highlightBest}
                onCheckedChange={setHighlightBest}
                disabled={items.length < 2}
                aria-label="Highlight best"
              />
              <label htmlFor="comparison-highlight" className="cursor-pointer">
                Highlight best
              </label>
            </div>
            {items.length < 5 ? (
              picker(
                "add",
                <Button size="sm" variant="outline" className="rounded-lg">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add {noun}
                </Button>,
              )
            ) : (
              <span className="text-muted-foreground text-xs">5 of 5 selected</span>
            )}
          </div>
        </div>
        {/* Horizontal scrolling keeps identities and their metric columns aligned. */}
        <div
          ref={headerScroll}
          onScroll={syncScroll}
          className="overflow-x-auto pb-1"
          role="region"
          aria-label={`${kind === "actor" ? "Actor" : "Builder"} comparison`}
          tabIndex={0}
        >
          <div className="grid gap-3" style={{ ...grid, minWidth }}>
            {items.map((item) => (
              <div
                key={item.id}
                className="border-border bg-background flex min-h-16 items-center justify-between gap-2 rounded-lg border px-3 py-3 sm:px-4"
              >
                {picker(
                  item.id,
                  <button
                    type="button"
                    aria-label={`Change ${item.title}`}
                    className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2.5 rounded text-left focus-visible:outline-none focus-visible:ring-2"
                  >
                    <Avatar className="border-border h-8 w-8 shrink-0 rounded-md border">
                      {item.imageUrl ? <AvatarImage src={item.imageUrl} alt="" /> : null}
                      <AvatarFallback className="rounded-md text-[10px] font-semibold">
                        {item.title.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{item.title}</span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
                        {item.subtitle}
                      </span>
                    </span>
                    <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                  </button>,
                  item.id,
                )}
                {item.href ? (
                  <Link
                    href={item.href}
                    aria-label={`View ${item.title} profile`}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded p-1.5 focus-visible:outline-none focus-visible:ring-2"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.title} from comparison`}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded p-1.5 focus-visible:outline-none focus-visible:ring-2"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {items.length === 1
              ? picker(
                  "empty",
                  <button
                    type="button"
                    className="border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex min-h-16 items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
                  >
                    <Plus className="h-4 w-4" />
                    Select {kind === "actor" ? "an Actor" : "a builder"}
                  </button>,
                )
              : null}
          </div>
        </div>
      </div>

      <section aria-label="Overview">
        <h2 className="mb-2 px-4 text-xl font-semibold tracking-tight sm:mb-3 sm:px-5">Overview</h2>
        <div
          ref={overviewScroll}
          onScroll={syncScroll}
          className="overflow-x-auto"
          role="region"
          aria-label="Overview metrics"
          tabIndex={0}
        >
          <div style={{ minWidth }}>{metricRows(overviewRows)}</div>
        </div>
        {items.length === 1 ? (
          <p className="text-muted-foreground mt-3 px-4 text-xs sm:px-5">
            Select another {noun} to compare side by side.
          </p>
        ) : null}
        <p className="text-muted-foreground mt-3 px-4 text-xs sm:px-5">
          Active users use the selected period. Runs and earnings always use 30 days.
        </p>
      </section>

      <ComparisonCharts items={items} kind={kind} window={window} />

      <section aria-label="Comparison details" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">All details</h2>
          <span className="text-muted-foreground text-xs">
            {visibleRows.length} of {rows.length} details
          </span>
        </div>
        <div className="border-border flex flex-wrap items-center gap-x-5 gap-y-3 border-b pb-4">
          <div className="relative min-w-44 flex-1 sm:max-w-72">
            <Search
              className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a metric"
              aria-label="Find a metric"
              className="h-9 rounded-lg pl-9 text-xs"
            />
          </div>
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="accent-foreground h-4 w-4"
              checked={differencesOnly}
              disabled={items.length < 2}
              onChange={(event) => setDifferencesOnly(event.target.checked)}
            />
            Differences only
          </label>
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="accent-foreground h-4 w-4"
              checked={completeOnly}
              onChange={(event) => setCompleteOnly(event.target.checked)}
            />
            Complete data only
          </label>
        </div>
        <div className="flex gap-1 overflow-x-auto" aria-label="Metric sections">
          {groups.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === group}
              onClick={() => setGroup(option)}
              className={`focus-visible:ring-ring shrink-0 rounded-lg px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 ${option === group ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {option}
            </button>
          ))}
        </div>
        <div
          ref={detailsScroll}
          onScroll={syncScroll}
          className="overflow-x-auto"
          role="region"
          aria-label="Detailed metrics"
          tabIndex={0}
        >
          <div style={{ minWidth }}>
            {[...new Set(visibleRows.map((row) => row.group))].map((name) => (
              <section key={name} aria-label={name} className="mb-8">
                <h3 className="border-border mb-1 border-b px-4 pb-3 text-lg font-semibold sm:px-5">
                  {name}
                </h3>
                {metricRows(visibleRows.filter((row) => row.group === name))}
              </section>
            ))}
          </div>
        </div>
        {!visibleRows.length ? (
          <div className="border-border rounded-lg border px-4 py-8 text-center text-sm">
            <p className="font-medium">No details match these filters</p>
            <button
              type="button"
              className="mt-2 underline underline-offset-4"
              onClick={() => {
                setGroup("All");
                setQuery("");
                setDifferencesOnly(false);
                setCompleteOnly(false);
              }}
            >
              Show all details
            </button>
          </div>
        ) : null}
        <p className="text-muted-foreground text-xs">
          — means the source has no published value. Zero is a published value.
        </p>
      </section>
    </div>
  );
}
