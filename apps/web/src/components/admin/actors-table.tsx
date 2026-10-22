"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpDown, ExternalLink, Eye, Filter, Globe2, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type AdminActor = {
  id: string;
  actorName: string;
  username: string;
  title: string | null;
  storeIsPublic: boolean | null;
  storeIsDeprecated: boolean | null;
  storeNotice: string | null;
  publishReady: boolean | null;
  updatedAt: string | null;
  user: { name: string | null; email: string };
  websiteIdentity: { id: string; name: string } | null;
};

type AdminActorsResponse = { items: AdminActor[]; total: number };
type WebsiteOptionsResponse = {
  items: Array<{ id: string; name: string }>;
};
type VisibilityFilter = "" | "PUBLIC" | "PRIVATE" | "UNKNOWN";
type BooleanFilter = "" | "true" | "false";
type SortField = "updatedAt" | "createdAt" | "actorName" | "title";
type SortOrder = "asc" | "desc";

function initialEnumParam<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = value?.trim() as T;
  return allowed.includes(candidate) ? candidate : fallback;
}

function updateAdminActorsUrl(input: {
  query: string;
  page: number;
  limit: number;
  visibility: VisibilityFilter;
  deprecated: BooleanFilter;
  publishReady: BooleanFilter;
  sort: SortField;
  order: SortOrder;
}) {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.page > 1) params.set("page", String(input.page));
  if (input.limit !== 50) params.set("limit", String(input.limit));
  if (input.visibility) params.set("visibility", input.visibility);
  if (input.deprecated) params.set("deprecated", input.deprecated);
  if (input.publishReady) params.set("publishReady", input.publishReady);
  if (input.sort !== "updatedAt") params.set("sort", input.sort);
  if (input.order !== "desc") params.set("order", input.order);
  const suffix = params.toString();
  window.history.replaceState(null, "", suffix ? `/admin/actors?${suffix}` : "/admin/actors");
}

function AdminActorsTableSkeleton() {
  return (
    <div
      className="border-border/80 bg-card rounded-md border"
      aria-label="Loading actor records"
      aria-live="polite"
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="border-border/30 flex items-center border-b px-5 py-4 last:border-0"
        >
          <Skeleton className="h-8 w-44" />
          <Skeleton className="ml-auto h-6 w-24" />
          <Skeleton className="ml-8 h-6 w-28" />
          <Skeleton className="ml-8 h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

export function AdminActorsTable({
  initialParams = {},
}: {
  initialParams?: Record<string, string | undefined>;
}) {
  const initialQuery = initialParams.q?.trim() ?? "";
  const initialPage = Math.max(1, Number(initialParams.page) || 1);
  const initialLimit = [25, 50, 100].includes(Number(initialParams.limit))
    ? Number(initialParams.limit)
    : 50;
  const [inputValue, setInputValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [visibility, setVisibility] = useState<VisibilityFilter>(
    initialEnumParam(initialParams.visibility, ["", "PUBLIC", "PRIVATE", "UNKNOWN"] as const, ""),
  );
  const [deprecated, setDeprecated] = useState<BooleanFilter>(
    initialEnumParam(initialParams.deprecated, ["", "true", "false"] as const, ""),
  );
  const [publishReady, setPublishReady] = useState<BooleanFilter>(
    initialEnumParam(initialParams.publishReady, ["", "true", "false"] as const, ""),
  );
  const [sort, setSort] = useState<SortField>(
    initialEnumParam(
      initialParams.sort,
      ["updatedAt", "createdAt", "actorName", "title"] as const,
      "updatedAt",
    ),
  );
  const [order, setOrder] = useState<SortOrder>(
    initialEnumParam(initialParams.order, ["asc", "desc"] as const, "desc"),
  );
  const [data, setData] = useState<AdminActorsResponse | null>(null);
  const [websites, setWebsites] = useState<WebsiteOptionsResponse["items"]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [websiteId, setWebsiteId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const syncUrl = useCallback(
    (nextPage: number) =>
      updateAdminActorsUrl({
        query,
        page: nextPage,
        limit,
        visibility,
        deprecated,
        publishReady,
        sort,
        order,
      }),
    [deprecated, limit, order, publishReady, query, sort, visibility],
  );

  const loadActors = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api<AdminActorsResponse>("/admin/actors", {
        params: {
          search: query || undefined,
          page,
          limit,
          visibility: visibility || undefined,
          deprecated: deprecated || undefined,
          publishReady: publishReady || undefined,
          sort,
          order,
        },
      });
      if (currentRequest !== requestId.current) return;
      if (!response.ok) setError(response.error.message);
      else {
        const responsePages = Math.max(1, Math.ceil(response.data.total / limit));
        if (page > responsePages) {
          setPage(responsePages);
          return;
        }
        setData(response.data);
      }
    } catch {
      if (currentRequest === requestId.current) setError("Could not reach the admin API");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [deprecated, limit, order, page, publishReady, query, sort, visibility]);

  useEffect(() => {
    void loadActors();
  }, [loadActors]);

  useEffect(() => {
    void api<WebsiteOptionsResponse>("/admin/website-logos?limit=200").then((response) => {
      if (response.ok) setWebsites(response.data.items);
    });
  }, []);

  useEffect(() => {
    setSelected(new Set());
  }, [page, query, visibility, deprecated, publishReady]);

  useEffect(() => {
    syncUrl(page);
  }, [page, syncUrl]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(inputValue.trim());
    setPage(1);
  }

  function clearFilters() {
    setInputValue("");
    setQuery("");
    setVisibility("");
    setDeprecated("");
    setPublishReady("");
    setSort("updatedAt");
    setOrder("desc");
    setPage(1);
  }

  async function assignSelected() {
    if (!websiteId || selected.size === 0) return;
    setAssigning(true);
    const response = await api(`/admin/website-logos/${websiteId}/assign`, {
      method: "POST",
      body: JSON.stringify({ workspaceActorIds: [...selected] }),
    });
    if (response.ok) {
      toast.success(`${selected.size} Actor${selected.size === 1 ? "" : "s"} reassigned`);
      setSelected(new Set());
      await loadActors();
    } else toast.error(response.error.message);
    setAssigning(false);
  }

  async function reclassifySelected() {
    if (selected.size === 0) return;
    setAssigning(true);
    const response = await api<{ reset: number; jobId: string | null }>(
      "/admin/website-logos/reclassify",
      {
        method: "POST",
        body: JSON.stringify({ workspaceActorIds: [...selected] }),
      },
    );
    if (response.ok) {
      toast.success(
        `${selected.size} Actor${selected.size === 1 ? "" : "s"} queued for reclassification`,
      );
      setSelected(new Set());
      await loadActors();
    } else toast.error(response.error.message);
    setAssigning(false);
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  const hasFilters = Boolean(
    query ||
    visibility ||
    deprecated ||
    publishReady ||
    sort !== "updatedAt" ||
    order !== "desc" ||
    limit !== 50,
  );

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <form
          className="border-border/60 grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_170px_170px_170px_auto_auto]"
          onSubmit={submitSearch}
        >
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              name="q"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Actor, owner, title, or username"
              className="pl-9"
              aria-label="Search Actors"
            />
          </div>
          <FilterSelect
            label="Store visibility"
            value={visibility}
            onChange={(value) => {
              setVisibility(value as VisibilityFilter);
              setPage(1);
            }}
            options={[
              ["", "Every visibility"],
              ["PUBLIC", "Public"],
              ["PRIVATE", "Private"],
              ["UNKNOWN", "Not synchronized"],
            ]}
          />
          <FilterSelect
            label="Deprecation status"
            value={deprecated}
            onChange={(value) => {
              setDeprecated(value as BooleanFilter);
              setPage(1);
            }}
            options={[
              ["", "Any deprecation state"],
              ["true", "Deprecated"],
              ["false", "Not deprecated"],
            ]}
          />
          <FilterSelect
            label="Publishing readiness"
            value={publishReady}
            onChange={(value) => {
              setPublishReady(value as BooleanFilter);
              setPage(1);
            }}
            options={[
              ["", "Any readiness"],
              ["true", "Ready to publish"],
              ["false", "Needs fixes"],
            ]}
          />
          <Button type="submit" variant="outline" disabled={loading}>
            <Search className="h-4 w-4" /> Search
          </Button>
          <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
            Clear
          </Button>
        </form>

        <div className="bg-muted/25 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Filter className="text-signal-blue h-3.5 w-3.5" />
            {data?.total.toLocaleString("en-IN") ?? "—"} matching Actors
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ArrowUpDown className="text-muted-foreground h-4 w-4" />
            <FilterSelect
              label="Sort Actors"
              value={`${sort}:${order}`}
              onChange={(value) => {
                const [nextSort, nextOrder] = value.split(":") as [SortField, SortOrder];
                setSort(nextSort);
                setOrder(nextOrder);
                setPage(1);
              }}
              options={[
                ["updatedAt:desc", "Recently updated"],
                ["updatedAt:asc", "Oldest update"],
                ["createdAt:desc", "Recently added"],
                ["actorName:asc", "Actor name A–Z"],
                ["actorName:desc", "Actor name Z–A"],
                ["title:asc", "Title A–Z"],
              ]}
            />
            <FilterSelect
              label="Items per page"
              value={String(limit)}
              onChange={(value) => {
                setLimit(Number(value));
                setPage(1);
              }}
              options={[
                ["25", "25 per page"],
                ["50", "50 per page"],
                ["100", "100 per page"],
              ]}
            />
          </div>
        </div>
      </Card>

      <section aria-busy={loading} aria-live="polite">
        {selected.size > 0 ? (
          <div className="border-signal-blue/30 bg-signal-blue/5 mb-3 flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe2 className="text-signal-blue h-4 w-4" />
              {selected.size} selected for website reassignment
            </div>
            <select
              value={websiteId}
              onChange={(event) => setWebsiteId(event.target.value)}
              aria-label="Website identity for selected Actors"
              className="border-input bg-card h-9 min-w-64 rounded-md border px-3 text-sm sm:ml-auto"
            >
              <option value="">Choose website or service</option>
              {websites.map((website) => (
                <option key={website.id} value={website.id}>
                  {website.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="signal"
              disabled={!websiteId || assigning}
              onClick={() => void assignSelected()}
            >
              {assigning ? "Assigning…" : "Assign website"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={assigning}
              onClick={() => void reclassifySelected()}
            >
              Reclassify automatically
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}
        {loading ? (
          <AdminActorsTableSkeleton />
        ) : error ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 rounded-md border p-4 text-sm"
          >
            <p className="text-destructive">The Actor registry could not load: {error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadActors()}>
              Try again
            </Button>
          </div>
        ) : data ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="border-border/60 bg-muted/30 text-muted-foreground border-b text-left text-xs">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all visible Actors"
                        checked={
                          data.items.length > 0 &&
                          data.items.every((actor) => selected.has(actor.id))
                        }
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            for (const actor of data.items) {
                              if (event.target.checked) next.add(actor.id);
                              else next.delete(actor.id);
                            }
                            return next;
                          })
                        }
                        className="accent-signal-orange h-4 w-4"
                      />
                    </th>
                    <th className="px-5 py-3 font-medium">Actor</th>
                    <th className="px-5 py-3 font-medium">Owner</th>
                    <th className="px-5 py-3 font-medium">Store state</th>
                    <th className="px-5 py-3 font-medium">Readiness</th>
                    <th className="px-5 py-3 font-medium">Updated</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-border/40 divide-y">
                  {data.items.map((actor) => (
                    <tr key={actor.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${actor.actorName}`}
                          checked={selected.has(actor.id)}
                          onChange={(event) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(actor.id);
                              else next.delete(actor.id);
                              return next;
                            })
                          }
                          className="accent-signal-orange h-4 w-4"
                        />
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/actors/${actor.id}`}
                          className="hover:text-signal-orange font-medium"
                        >
                          {actor.title ?? actor.actorName}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {actor.username}/{actor.actorName}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {actor.websiteIdentity?.name ?? "Website not classified"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p>{actor.user.name ?? "Unnamed user"}</p>
                        <p className="text-muted-foreground text-xs">{actor.user.email}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          <StoreStateBadge actor={actor} />
                          {actor.storeNotice ? <Badge variant="warning">Notice</Badge> : null}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge
                          variant={
                            actor.publishReady
                              ? "success"
                              : actor.publishReady === false
                                ? "warning"
                                : "secondary"
                          }
                        >
                          {actor.publishReady
                            ? "Ready"
                            : actor.publishReady === false
                              ? "Needs fixes"
                              : "Not checked"}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground px-5 py-3.5 text-xs">
                        {actor.updatedAt ? formatDate(actor.updatedAt) : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <Link
                              href={`/admin/actors/${actor.id}`}
                              aria-label={`Open ${actor.actorName}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <Link
                              href={`https://apify.com/${actor.username}/${actor.actorName}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`View ${actor.actorName} on Apify`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-muted-foreground py-14 text-center text-sm">
                        No Actors match the active filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </section>

      {!loading && !error && data ? (
        <nav
          aria-label="Actor pagination"
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="text-muted-foreground">
            Page {Math.min(page, totalPages)} of {totalPages} · {data.total.toLocaleString("en-IN")}{" "}
            records
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function StoreStateBadge({ actor }: { actor: AdminActor }) {
  if (actor.storeIsDeprecated) return <Badge variant="destructive">Deprecated</Badge>;
  if (actor.storeIsPublic === true) return <Badge variant="success">Public</Badge>;
  if (actor.storeIsPublic === false) return <Badge variant="secondary">Private</Badge>;
  return <Badge variant="outline">Unknown</Badge>;
}
