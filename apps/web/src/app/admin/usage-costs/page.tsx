"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { DollarSign, TrendingUp, RefreshCw, Calendar, Filter, X } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/admin/api";
import type { UsageCostItem, UsageCostSummary } from "@/lib/admin/api-types";
import { toast } from "sonner";

type UsageCostFilters = {
  search: string;
  from: string;
  to: string;
  sort: string;
  order: string;
  limit: string;
};

const EMPTY_FILTERS: UsageCostFilters = {
  search: "",
  from: "",
  to: "",
  sort: "date",
  order: "desc",
  limit: "50",
};

export default function UsageCostsPage() {
  const [items, setItems] = useState<UsageCostItem[]>([]);
  const [summary, setSummary] = useState<UsageCostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<UsageCostFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<UsageCostFilters>(EMPTY_FILTERS);
  const requestId = useRef(0);
  const invalidateRequests = useCallback(() => {
    requestId.current++;
  }, []);

  const fetchData = useCallback(async (requestedPage = 1, active = EMPTY_FILTERS) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const params = {
        search: active.search || undefined,
        from: active.from || undefined,
        to: active.to || undefined,
        sort: active.sort,
        order: active.order,
        page: requestedPage,
        limit: Number(active.limit),
      };
      const [itemsRes, summaryRes] = await Promise.all([
        api<{ items: UsageCostItem[]; total: number }>("/admin/usage-costs", { params }),
        api<UsageCostSummary>("/admin/usage-costs/summary", {
          params: {
            search: active.search || undefined,
            from: active.from || undefined,
            to: active.to || undefined,
          },
        }),
      ]);
      if (currentRequest !== requestId.current) return;
      if ("error" in itemsRes) throw new Error(itemsRes.error.message);
      if ("error" in summaryRes) throw new Error(summaryRes.error.message);
      setItems(itemsRes.data.items);
      setTotal(itemsRes.data.total);
      setPage(requestedPage);
      setSummary(summaryRes.data);
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      const message = e instanceof Error ? e.message : "Failed to load usage costs";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api("/admin/usage-costs/sync", { method: "POST" });
      if ("error" in result) throw new Error(result.error.message);
      await fetchData();
      toast.success("Apify usage costs synchronized");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to synchronize usage costs");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void fetchData();
    return invalidateRequests;
  }, [fetchData, invalidateRequests]);

  const totalCost = Number(summary?.totalUsageCostUsd ?? 0);
  const totalRuns = Number(summary?.totalRuns ?? 0);

  return (
    <div>
      <PageHeader
        title="Apify usage costs"
        description="Daily platform expenses charged to the configured Apify account"
        actions={
          <Button size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sync
          </Button>
        }
      />

      {loadError ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive mt-6 rounded-md border p-3 text-sm"
        >
          {loadError}
        </div>
      ) : null}

      <div className="border-border mt-6 grid gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_160px_160px_180px_120px_110px_auto_auto]">
        <Input
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
          placeholder="Search Actor name or Apify ID"
          aria-label="Search usage costs by Actor"
        />
        <Input
          type="date"
          value={filters.from}
          onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
          aria-label="Usage costs from date"
        />
        <Input
          type="date"
          value={filters.to}
          onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          aria-label="Usage costs to date"
        />
        <select
          value={filters.sort}
          onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}
          className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          aria-label="Sort usage costs"
        >
          <option value="date">Date</option>
          <option value="usageCostUsd">Usage cost</option>
          <option value="runs">Runs</option>
          <option value="adjustmentUsd">Adjustment</option>
          <option value="actorId">Actor</option>
        </select>
        <select
          value={filters.order}
          onChange={(event) => setFilters((current) => ({ ...current, order: event.target.value }))}
          className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          aria-label="Usage cost sort direction"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
        <select
          value={filters.limit}
          onChange={(event) => setFilters((current) => ({ ...current, limit: event.target.value }))}
          className="border-input bg-card h-9 rounded-md border px-3 text-sm"
          aria-label="Usage cost rows per page"
        >
          <option value="25">25 rows</option>
          <option value="50">50 rows</option>
          <option value="100">100 rows</option>
          <option value="200">200 rows</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAppliedFilters(filters);
            void fetchData(1, filters);
          }}
        >
          <Filter className="h-4 w-4" /> Apply
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            setAppliedFilters(EMPTY_FILTERS);
            void fetchData(1, EMPTY_FILTERS);
          }}
        >
          <X className="h-4 w-4" /> Clear
        </Button>
      </div>

      {loading && !summary ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted h-24 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {loading ? (
            <p
              role="status"
              className="border-border bg-card fixed bottom-4 right-4 z-40 rounded-sm border px-3 py-2 text-xs shadow-md"
            >
              Updating results…
            </p>
          ) : null}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Total usage cost (USD)"
              value={`$${totalCost.toFixed(2)}`}
              icon={DollarSign}
            />
            <StatCard label="Total runs" value={totalRuns.toLocaleString()} icon={TrendingUp} />
            {summary ? (
              <StatCard
                label="Avg daily (USD)"
                value={`$${Number(summary.avgDailyUsageCostUsd).toFixed(2)}`}
                icon={Calendar}
              />
            ) : null}
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3 text-right">Usage cost (USD)</th>
                  <th className="px-4 py-3 text-right">Runs</th>
                  <th className="px-4 py-3 text-right">Adjustment</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-border/40 divide-y">
                {items.map((item, idx) => (
                  <tr key={item.id ?? idx} className="hover:bg-muted/20">
                    <td className="text-muted-foreground px-4 py-2.5">{item.date}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {item.actor?.actorName ?? item.actorId}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ${Number(item.usageCostUsd).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{item.runs}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {item.adjustmentUsd ? (
                        <span className="text-destructive">
                          ${Number(item.adjustmentUsd).toFixed(2)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {item.actorId ? (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/actors/${item.actorId}`}>Open</Link>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > Number(appliedFilters.limit) ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {page} of {Math.ceil(total / Number(appliedFilters.limit))} · {total} records
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => void fetchData(page - 1, appliedFilters)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / Number(appliedFilters.limit)) || loading}
                  onClick={() => void fetchData(page + 1, appliedFilters)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
