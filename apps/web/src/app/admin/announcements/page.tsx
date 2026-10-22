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
import { Plus, Trash2, Megaphone, Pencil, X, Save } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Announcement {
  id: string;
  title: string;
  body: string;
  emoji: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  _count: { dismissals: number };
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [emoji, setEmoji] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [windowFilter, setWindowFilter] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);

  function resetForm() {
    setTitle("");
    setBody("");
    setEmoji("");
    setLinkUrl("");
    setLinkLabel("");
    setStartsAt("");
    setEndsAt("");
    setEditingId(null);
  }

  function edit(announcement: Announcement) {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setBody(announcement.body);
    setEmoji(announcement.emoji ?? "");
    setLinkUrl(announcement.linkUrl ?? "");
    setLinkLabel(announcement.linkLabel ?? "");
    setStartsAt(announcement.startsAt ? announcement.startsAt.slice(0, 16) : "");
    setEndsAt(announcement.endsAt ? announcement.endsAt.slice(0, 16) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    api<Announcement[]>("/admin/announcements").then((r) => {
      if (r.ok) setItems(r.data);
      else setLoadError(r.error.message ?? "Could not load announcements");
      setLoading(false);
    });
  }, []);

  async function create() {
    const res = await api(
      editingId ? `/admin/announcements/${editingId}` : "/admin/announcements",
      {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          title,
          body,
          emoji: emoji || (editingId ? null : undefined),
          linkUrl: linkUrl || (editingId ? null : undefined),
          linkLabel: linkLabel || (editingId ? null : undefined),
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          endsAt: endsAt ? new Date(endsAt).toISOString() : editingId ? null : undefined,
        }),
      },
    );
    if (!res.ok) {
      const message = res.error.message ?? "Failed to save announcement";
      toast.error(message);
      throw new Error(message);
    }
    toast.success(editingId ? "Announcement updated" : "Announcement created");
    resetForm();
    const refresh = await api<Announcement[]>("/admin/announcements");
    if (refresh.ok) setItems(refresh.data);
  }

  async function remove(id: string) {
    const response = await api(`/admin/announcements/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(response.error.message ?? "Failed to delete announcement");
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Deleted");
  }

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = Date.now();
    return items
      .filter((item) => {
        if (
          normalizedQuery &&
          ![item.title, item.body, item.linkLabel, item.linkUrl]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(normalizedQuery))
        ) {
          return false;
        }
        const starts = new Date(item.startsAt).getTime();
        const ends = item.endsAt ? new Date(item.endsAt).getTime() : null;
        if (windowFilter === "active") return starts <= now && (ends === null || ends > now);
        if (windowFilter === "upcoming") return starts > now;
        if (windowFilter === "expired") return ends !== null && ends <= now;
        if (windowFilter === "open") return ends === null;
        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sort === "title") comparison = a.title.localeCompare(b.title);
        else if (sort === "startsAt") comparison = a.startsAt.localeCompare(b.startsAt);
        else if (sort === "dismissals") comparison = a._count.dismissals - b._count.dismissals;
        else comparison = a.createdAt.localeCompare(b.createdAt);
        return order === "asc" ? comparison : -comparison;
      });
  }, [items, order, query, sort, windowFilter]);
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = visibleItems.slice((currentPage - 1) * limit, currentPage * limit);

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" description="In-app banners shown to all users." />

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
          <CardTitle className="text-base">
            {editingId ? "Edit announcement" : "New announcement"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body..."
            rows={3}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="Emoji" />
            <Input
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Link label"
            />
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://… or /path"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="announcement-starts-at" className="space-y-1 text-xs">
              <span className="text-muted-foreground">Starts at</span>
              <Input
                id="announcement-starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label htmlFor="announcement-ends-at" className="space-y-1 text-xs">
              <span className="text-muted-foreground">Ends at</span>
              <Input
                id="announcement-ends-at"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
          </div>
          <Button onClick={() => setSaveOpen(true)} disabled={!title.trim() || !body.trim()}>
            {editingId ? <Save className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
            {editingId ? "Save changes" : "Publish"}
          </Button>
          {editingId ? (
            <Button variant="outline" onClick={resetForm}>
              <X className="mr-1 h-4 w-4" /> Cancel
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <ClientCollectionControls
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        searchPlaceholder="Search title, body, or link"
        filterLabel="Window"
        filterValue={windowFilter}
        onFilterChange={(value) => {
          setWindowFilter(value);
          setPage(1);
        }}
        filterOptions={[
          { value: "active", label: "Active" },
          { value: "upcoming", label: "Upcoming" },
          { value: "expired", label: "Expired" },
          { value: "open", label: "No end date" },
        ]}
        sortValue={sort}
        onSortChange={(value) => {
          setSort(value);
          setPage(1);
        }}
        sortOptions={[
          { value: "createdAt", label: "Created" },
          { value: "startsAt", label: "Start date" },
          { value: "title", label: "Title" },
          { value: "dismissals", label: "Dismissals" },
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
          setWindowFilter("");
          setSort("createdAt");
          setOrder("desc");
          setLimit(25);
          setPage(1);
        }}
      />

      <div className="space-y-3">
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : visibleItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">No announcements match these filters.</p>
        ) : (
          pagedItems.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-start justify-between p-4">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <Megaphone className="text-signal-orange h-4 w-4" />
                    {a.emoji ? `${a.emoji} ` : ""}
                    {a.title}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">{a.body}</p>
                  <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
                    <span>{formatDate(a.createdAt)}</span>
                    <Badge variant="outline">{a._count.dismissals} dismissed</Badge>
                    <span>
                      {formatDate(a.startsAt)} → {a.endsAt ? formatDate(a.endsAt) : "No end"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => edit(a)}
                    aria-label={`Edit ${a.title}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteId(a.id)}
                    aria-label={`Delete ${a.title}`}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <ConfirmDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={editingId ? "Update this announcement?" : "Publish this announcement?"}
        description="The announcement will be shown to users during the configured active window."
        confirmLabel={editingId ? "Update announcement" : "Publish announcement"}
        onConfirm={create}
      />
      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete announcement?"
        description="This announcement will be removed for all users."
        confirmLabel="Delete announcement"
        destructive
        onConfirm={() => (deleteId ? remove(deleteId) : undefined)}
      />
    </div>
  );
}
