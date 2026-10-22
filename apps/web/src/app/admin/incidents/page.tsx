"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-header";
import { ClientCollectionControls } from "@/components/admin/client-collection-controls";
import { api } from "@/lib/admin/api";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default function AdminIncidentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [loadError, setLoadError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<any | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<any[]>("/admin/incidents").then((r) => {
      if (r.ok) setItems(r.data);
      else setLoadError(r.error.message ?? "Could not load incidents");
      setLoading(false);
    });
  }, []);

  async function create() {
    const res = await api("/admin/incidents", {
      method: "POST",
      body: JSON.stringify({ title, message, severity }),
    });
    if (!res.ok) {
      const error = res.error.message ?? "Failed to create incident";
      toast.error(error);
      throw new Error(error);
    }
    toast.success("Incident created");
    setTitle("");
    setMessage("");
    const refresh = await api<any[]>("/admin/incidents");
    if (refresh.ok) setItems(refresh.data);
  }

  async function resolve(id: string) {
    const response = await api<any>(`/admin/incidents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "resolved",
        resolvedAt: new Date().toISOString(),
        message: "Resolved.",
      }),
    });
    if (!response.ok) {
      const error = response.error.message ?? "Failed to resolve incident";
      toast.error(error);
      throw new Error(error);
    }
    setItems((current) =>
      current.map((incident) => (incident.id === id ? response.data : incident)),
    );
    toast.success("Incident resolved");
  }

  const statusColors: Record<string, string> = {
    resolved: "bg-signal-green/10 text-signal-green",
    monitoring: "bg-signal-blue/10 text-signal-blue",
    identified: "bg-signal-orange/10 text-signal-orange",
    investigating: "bg-destructive/10 text-destructive",
  };

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (statusFilter && item.status !== statusFilter) return false;
        return (
          !normalizedQuery ||
          [item.title, item.message, item.severity, item.status].some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(normalizedQuery),
          )
        );
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sort === "title") comparison = String(a.title).localeCompare(String(b.title));
        else if (sort === "severity") {
          const weight: Record<string, number> = { minor: 1, major: 2, critical: 3 };
          comparison = (weight[a.severity] ?? 0) - (weight[b.severity] ?? 0);
        } else if (sort === "status") comparison = String(a.status).localeCompare(String(b.status));
        else comparison = String(a.createdAt).localeCompare(String(b.createdAt));
        return order === "asc" ? comparison : -comparison;
      });
  }, [items, order, query, sort, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = visibleItems.slice((currentPage - 1) * limit, currentPage * limit);

  return (
    <div className="space-y-6">
      <PageHeader title="Incidents" description="System status page management." />

      {loadError ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm"
        >
          {loadError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report incident</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Incident title"
            aria-label="Incident title"
          />
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="What's happening?"
            aria-label="Incident message"
          />
          <div className="flex gap-3">
            <select
              value={severity}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSeverity(e.target.value)}
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
              aria-label="Incident severity"
            >
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="critical">Critical</option>
            </select>
            <Button onClick={() => setCreateOpen(true)} disabled={!title.trim() || !message.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Report
            </Button>
          </div>
        </CardContent>
      </Card>

      <ClientCollectionControls
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        searchPlaceholder="Search incident title or update"
        filterLabel="Status"
        filterValue={statusFilter}
        onFilterChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        filterOptions={[
          { value: "investigating", label: "Investigating" },
          { value: "identified", label: "Identified" },
          { value: "monitoring", label: "Monitoring" },
          { value: "resolved", label: "Resolved" },
        ]}
        sortValue={sort}
        onSortChange={(value) => {
          setSort(value);
          setPage(1);
        }}
        sortOptions={[
          { value: "createdAt", label: "Created" },
          { value: "title", label: "Title" },
          { value: "severity", label: "Severity" },
          { value: "status", label: "Status" },
        ]}
        order={order}
        onOrderChange={(value) => {
          setOrder(value);
          setPage(1);
        }}
        limit={limit}
        onLimitChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
        page={currentPage}
        total={visibleItems.length}
        onPageChange={setPage}
        onReset={() => {
          setQuery("");
          setStatusFilter("");
          setSort("createdAt");
          setOrder("desc");
          setLimit(25);
          setPage(1);
        }}
      />

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : visibleItems.length === 0 ? (
        <p className="text-muted-foreground text-sm">No incidents match these filters.</p>
      ) : (
        pagedItems.map((inc: any) => (
          <Card key={inc.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Link href={`/admin/incidents/${inc.id}`} className="font-medium hover:underline">
                    {inc.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant="outline" className={statusColors[inc.status] ?? ""}>
                      {inc.status}
                    </Badge>
                    <Badge variant="outline">{inc.severity}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(inc.createdAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm">{inc.message}</p>
                </div>
                {inc.status !== "resolved" && (
                  <Button variant="outline" size="sm" onClick={() => setResolveTarget(inc)}>
                    Resolve
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
      <ConfirmDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Publish this incident?"
        description="The incident will appear on the public status page immediately."
        confirmLabel="Publish incident"
        onConfirm={create}
      />
      <ConfirmDialog
        open={Boolean(resolveTarget)}
        onOpenChange={(open) => {
          if (!open) setResolveTarget(null);
        }}
        title="Resolve this incident?"
        description="The public status page will mark this incident as resolved immediately."
        confirmLabel="Resolve incident"
        onConfirm={() => (resolveTarget ? resolve(resolveTarget.id) : undefined)}
      />
    </div>
  );
}
