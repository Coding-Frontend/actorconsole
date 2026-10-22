import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Option = { value: string; label: string };

export function AdminRegistryFilters({
  path,
  params,
  searchPlaceholder,
  filters = [],
  sorts,
  defaultSort,
  pageSizes = [25, 50, 100],
}: {
  path: string;
  params: Record<string, string | undefined>;
  searchPlaceholder: string;
  filters?: Array<{ name: string; label: string; options: Option[] }>;
  sorts: Option[];
  defaultSort: string;
  pageSizes?: number[];
}) {
  const requestedLimit = Number(params.limit ?? 50);
  const limit = pageSizes.includes(requestedLimit) ? requestedLimit : 50;

  return (
    <form
      method="get"
      className="border-border grid gap-3 border-b p-4 sm:grid-cols-2 xl:flex xl:flex-wrap"
    >
      <label htmlFor="admin-registry-search" className="relative min-w-64 flex-1">
        <span className="sr-only">Search registry</span>
        <Search className="text-muted-foreground pointer-events-none absolute left-3 top-3 h-4 w-4" />
        <Input
          id="admin-registry-search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder={searchPlaceholder}
          className="h-9 pl-9"
        />
      </label>
      {filters.map((filter) => (
        <label key={filter.name} className="min-w-36">
          <span className="sr-only">{filter.label}</span>
          <select
            name={filter.name}
            defaultValue={params[filter.name] ?? ""}
            aria-label={filter.label}
            className="border-input bg-card h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">All {filter.label.toLowerCase()}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="min-w-40">
        <span className="sr-only">Sort registry</span>
        <select
          name="sort"
          defaultValue={params.sort ?? defaultSort}
          aria-label="Sort registry"
          className="border-input bg-card h-9 w-full rounded-md border px-3 text-sm"
        >
          {sorts.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-32">
        <span className="sr-only">Sort direction</span>
        <select
          name="order"
          defaultValue={params.order ?? "desc"}
          aria-label="Sort direction"
          className="border-input bg-card h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>
      <label className="min-w-28">
        <span className="sr-only">Rows per page</span>
        <select
          name="limit"
          defaultValue={String(limit)}
          aria-label="Rows per page"
          className="border-input bg-card h-9 w-full rounded-md border px-3 text-sm"
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size} rows
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline" size="sm">
        <Filter className="h-4 w-4" /> Apply
      </Button>
      <Button type="button" variant="ghost" size="sm" asChild>
        <Link href={path}>Clear</Link>
      </Button>
    </form>
  );
}
