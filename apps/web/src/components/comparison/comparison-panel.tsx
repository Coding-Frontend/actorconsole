"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  ComparisonMatrix,
  comparisonValuePresent,
  type ComparisonItem,
  type ComparisonRow,
} from "./comparison-ui";
import { ComparisonColumns } from "./comparison-columns";

export function ComparisonPanel({
  items,
  rows,
  onRemove,
  ariaLabel,
  presentation = "matrix",
  selectionColumn,
}: {
  items: ComparisonItem[];
  rows: ComparisonRow[];
  onRemove?: (id: string) => void;
  ariaLabel?: string;
  presentation?: "matrix" | "columns";
  selectionColumn?: ReactNode;
}) {
  const [group, setGroup] = useState("All");
  const [query, setQuery] = useState("");
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [completeOnly, setCompleteOnly] = useState(false);
  const [highlightBest, setHighlightBest] = useState(false);
  const groups = useMemo(() => ["All", ...new Set(rows.map((row) => row.group))], [rows]);
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (group !== "All" && row.group !== group) return false;
        if (
          query &&
          !`${row.label} ${row.group}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
        )
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
      }),
    [rows, group, query, items, completeOnly, differencesOnly],
  );

  return (
    <div className="space-y-4">
      <div
        className={
          presentation === "columns"
            ? "border-border flex flex-col gap-3 border-b pb-4 xl:flex-row xl:items-center xl:justify-between"
            : "border-border flex flex-col gap-3 border-b pb-4"
        }
      >
        <div className="flex gap-1 overflow-x-auto pb-1" aria-label="Metric sections">
          {groups.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setGroup(option)}
              aria-pressed={group === option}
              className={`focus-visible:ring-ring shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${group === option ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="relative min-w-40 flex-1 sm:max-w-64">
            <Search
              className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Find a metric"
              placeholder="Find a metric"
              className="h-9 pl-9 text-xs"
            />
          </div>
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="accent-foreground h-4 w-4"
              checked={differencesOnly}
              disabled={items.length < 2}
              onChange={(event) => setDifferencesOnly(event.target.checked)}
            />{" "}
            Differences only
          </label>
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="accent-foreground h-4 w-4"
              checked={completeOnly}
              onChange={(event) => setCompleteOnly(event.target.checked)}
            />{" "}
            Complete data only
          </label>
          {presentation === "columns" ? (
            <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="accent-signal-orange h-4 w-4"
                checked={highlightBest}
                disabled={items.length < 2}
                onChange={(event) => setHighlightBest(event.target.checked)}
              />{" "}
              Highlight leaders
            </label>
          ) : null}
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {visibleRows.length} of {rows.length} details
          </span>
        </div>
      </div>
      {presentation === "columns" ? (
        <ComparisonColumns
          items={items}
          rows={visibleRows}
          onRemove={onRemove}
          highlightBest={highlightBest}
          ariaLabel={ariaLabel ?? "Side by side comparison"}
          selectionColumn={selectionColumn}
        />
      ) : visibleRows.length ? (
        <ComparisonMatrix
          items={items}
          rows={visibleRows}
          onRemove={onRemove}
          ariaLabel={ariaLabel}
        />
      ) : null}
      {!visibleRows.length ? (
        <div className="border-border bg-muted/20 border px-4 py-8 text-center text-sm">
          <p className="font-semibold">No details match these filters</p>
          <button
            type="button"
            className="text-signal-blue mt-2 hover:underline"
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
      <p className="text-muted-foreground text-xs">— means the source has no published value.</p>
    </div>
  );
}
