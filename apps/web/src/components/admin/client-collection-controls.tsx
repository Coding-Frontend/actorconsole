"use client";

import { ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Option = { value: string; label: string };

export function ClientCollectionControls({
  query,
  onQueryChange,
  searchPlaceholder,
  filterLabel,
  filterValue,
  onFilterChange,
  filterOptions = [],
  sortValue,
  onSortChange,
  sortOptions,
  order,
  onOrderChange,
  limit,
  onLimitChange,
  page,
  total,
  onPageChange,
  onReset,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
  filterLabel?: string;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterOptions?: Option[];
  sortValue: string;
  onSortChange: (value: string) => void;
  sortOptions: Option[];
  order: "asc" | "desc";
  onOrderChange: (value: "asc" | "desc") => void;
  limit: number;
  onLimitChange: (value: number) => void;
  page: number;
  total: number;
  onPageChange: (value: number) => void;
  onReset: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="border-border bg-card space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_repeat(4,minmax(130px,auto))_auto]">
        <label htmlFor="admin-client-collection-search" className="relative">
          <span className="sr-only">Search records</span>
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-3 h-4 w-4" />
          <Input
            id="admin-client-collection-search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 pl-9"
          />
        </label>
        {filterLabel && onFilterChange ? (
          <label>
            <span className="sr-only">{filterLabel}</span>
            <select
              value={filterValue ?? ""}
              onChange={(event) => onFilterChange(event.target.value)}
              aria-label={filterLabel}
              className="border-input bg-card h-10 w-full rounded-sm border px-3 text-sm"
            >
              <option value="">All {filterLabel.toLowerCase()}</option>
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span className="sr-only">Sort records</span>
          <select
            value={sortValue}
            onChange={(event) => onSortChange(event.target.value)}
            aria-label="Sort records"
            className="border-input bg-card h-10 w-full rounded-sm border px-3 text-sm"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Sort direction</span>
          <select
            value={order}
            onChange={(event) => onOrderChange(event.target.value as "asc" | "desc")}
            aria-label="Sort direction"
            className="border-input bg-card h-10 w-full rounded-sm border px-3 text-sm"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Rows per page</span>
          <select
            value={String(limit)}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            aria-label="Rows per page"
            className="border-input bg-card h-10 w-full rounded-sm border px-3 text-sm"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} rows
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="ghost" onClick={onReset}>
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Showing {first}–{last} of {total}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
