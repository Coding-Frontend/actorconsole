"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";

import {
  ChangelogEditor,
  newChangelogForm,
  type ChangelogForm,
} from "@/components/admin/changelog-editor";
import type { ChangelogCategory } from "@/services/changelog";

type EntryType = "FEATURE" | "FIX" | "PERF" | "SECURITY" | "UI" | "CHORE";

interface ChangelogEntry {
  id: string;
  version: string;
  releaseDate: string;
  versionSummary: string | null;
  type: EntryType;
  text: string;
  title: string | null;
  slug: string | null;
  body: string | null;
  category: ChangelogCategory;
  tags: string[];
  sortOrder: number;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
}

interface VersionInfo {
  version: string;
  releaseDate: string | null;
  count: number;
  publishedCount: number;
}

const typeBadgeColor: Record<EntryType, string> = {
  FEATURE: "border-signal-blue/25 bg-signal-blue/10 text-signal-blue",
  FIX: "border-destructive/25 bg-destructive/10 text-destructive",
  PERF: "border-signal-orange/25 bg-signal-orange/10 text-signal-orange",
  SECURITY: "border-signal-green/25 bg-signal-green/10 text-signal-green",
  UI: "border-signal-blue/25 bg-signal-blue/10 text-signal-blue",
  CHORE: "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export default function AdminChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterVersion, setFilterVersion] = useState("");
  const [filterPublished, setFilterPublished] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ChangelogForm>(newChangelogForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [publishId, setPublishId] = useState<string | null>(null);
  const [savePublishOpen, setSavePublishOpen] = useState(false);
  const [unpublishId, setUnpublishId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  const limit = 50;

  useEffect(() => {
    loadEntries();
    loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterVersion, filterPublished, search]);

  function loadEntries() {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filterVersion) params.set("version", filterVersion);
    if (filterPublished) params.set("isPublished", filterPublished);
    if (search) params.set("search", search);

    api<{ items: ChangelogEntry[]; total: number }>(`/admin/changelog/entries?${params}`)
      .then((r) => {
        if (r.ok) {
          const totalPages = Math.max(1, Math.ceil(r.data.total / limit));
          if (page > totalPages) {
            setPage(totalPages);
            setLoading(false);
            return;
          }
          setEntries(r.data.items);
          setTotal(r.data.total);
        } else setLoadError(r.error.message ?? "Could not load changelog entries");
        setLoading(false);
      })
      .catch(() => {
        setLoadError("Could not load changelog entries. Please try again.");
        setLoading(false);
      });
  }

  function loadVersions() {
    api<VersionInfo[]>("/admin/changelog/versions")
      .then((r) => {
        if (r.ok) setVersions(r.data);
        else setLoadError(r.error.message ?? "Could not load changelog versions");
      })
      .catch(() => setLoadError("Could not load changelog versions. Please try again."));
  }

  async function publish(id: string) {
    const response = await api(`/admin/changelog/entries/${id}/publish`, { method: "POST" });
    if (!response.ok) {
      const message = response.error.message ?? "Failed to publish changelog entry";
      toast.error(message);
      throw new Error(message);
    }
    toast.success("Published");
    loadEntries();
    loadVersions();
  }

  async function unpublish(id: string) {
    const response = await api(`/admin/changelog/entries/${id}/unpublish`, { method: "POST" });
    if (!response.ok) {
      throw new Error(response.error.message ?? "Failed to unpublish changelog entry");
    }
    toast.success("Unpublished");
    loadEntries();
    loadVersions();
  }

  async function remove(id: string) {
    const response = await api(`/admin/changelog/entries/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(response.error.message ?? "Failed to delete changelog entry");
    }
    toast.success("Deleted");
    loadEntries();
    loadVersions();
  }

  function startEdit(entry: ChangelogEntry) {
    setForm({
      version: entry.version,
      releaseDate: entry.releaseDate.slice(0, 10),
      type: entry.type,
      text: entry.text,
      title: entry.title ?? entry.text.slice(0, 240),
      slug: entry.slug ?? `update-${entry.id}`,
      body: entry.body ?? "",
      category: entry.category ?? (entry.type === "FEATURE" ? "RELEASE" : "IMPROVEMENT"),
      tags: entry.tags ?? [],
      sortOrder: entry.sortOrder,
      versionSummary: entry.versionSummary ?? "",
      isPublished: entry.isPublished,
    });
    setEditingId(entry.id);
    setShowForm(true);
  }

  function cancelEdit() {
    setForm(newChangelogForm());
    setEditingId(null);
    setShowForm(false);
  }

  async function persistEntry(throwOnError = false) {
    const payload = {
      ...form,
      versionSummary: form.versionSummary || null,
    };

    let res;
    try {
      res = editingId
        ? await api(`/admin/changelog/entries/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await api("/admin/changelog/entries", { method: "POST", body: JSON.stringify(payload) });
    } catch {
      const message = "Could not save this update. Your changes are preserved; please try again.";
      toast.error(message);
      setLoadError(message);
      if (throwOnError) throw new Error(message);
      return;
    }
    if (!res.ok) {
      const message = res.error.message ?? "Failed to save changelog entry";
      toast.error(message);
      setLoadError(message);
      if (throwOnError) throw new Error(message);
      return;
    }

    toast.success(editingId ? "Updated" : "Created");
    setForm(newChangelogForm());
    setEditingId(null);
    setShowForm(false);
    loadEntries();
    loadVersions();
  }

  function save() {
    startSave(() => persistEntry());
  }

  const publishedCount = entries.filter((e) => e.isPublished).length;
  const draftCount = entries.filter((e) => !e.isPublished).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Changelog"
        description="Manage public release notes and changelog entries."
        actions={
          <Button
            onClick={() => {
              setForm(newChangelogForm());
              setEditingId(null);
              setShowForm(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> New entry
          </Button>
        }
      />

      {loadError ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm"
        >
          {loadError}
        </p>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{entries.length}</p>
            <p className="text-muted-foreground text-xs">On this page</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-signal-green text-2xl font-bold">{publishedCount}</p>
            <p className="text-muted-foreground text-xs">Published</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-signal-orange text-2xl font-bold">{draftCount}</p>
            <p className="text-muted-foreground text-xs">Drafts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{versions.length}</p>
            <p className="text-muted-foreground text-xs">Versions</p>
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "Edit entry" : "New changelog entry"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChangelogEditor
              key={editingId ?? "new"}
              form={form}
              setForm={setForm}
              editing={Boolean(editingId)}
              saving={saving}
              onSave={() => (form.isPublished ? setSavePublishOpen(true) : save())}
              onCancel={cancelEdit}
            />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search changelog entries"
          placeholder="Search entries..."
          className="w-60"
        />
        <select
          aria-label="Publication status"
          value={filterPublished}
          onChange={(e) => {
            setFilterPublished(e.target.value);
            setPage(1);
          }}
          className="border-input flex h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="">All status</option>
          <option value="true">Published</option>
          <option value="false">Drafts</option>
        </select>
        <select
          aria-label="Version filter"
          value={filterVersion}
          onChange={(e) => {
            setFilterVersion(e.target.value);
            setPage(1);
          }}
          className="border-input flex h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="">All versions</option>
          {versions.map((v) => (
            <option key={v.version} value={v.version}>
              {v.version === "Unreleased" ? "Unreleased" : `v${v.version}`} · {v.publishedCount}/
              {v.count}
            </option>
          ))}
        </select>
      </div>

      {/* Entries table */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No changelog entries found.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${typeBadgeColor[entry.type] ?? ""}`}
                    >
                      {entry.type}
                    </Badge>
                    <span className="text-muted-foreground text-xs font-medium">
                      {entry.version === "Unreleased" ? "Unreleased" : `v${entry.version}`}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {entry.releaseDate.slice(0, 10)}
                    </span>
                    <span className="text-muted-foreground text-xs">#{entry.sortOrder}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        entry.isPublished
                          ? "border-signal-green/30 text-signal-green"
                          : "border-signal-orange/30 text-signal-orange"
                      }`}
                    >
                      {entry.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  <p className="mt-2 break-words text-sm font-semibold">
                    {entry.title || entry.text}
                  </p>
                  {entry.title && (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{entry.text}</p>
                  )}
                  <div className="text-muted-foreground mt-2 flex flex-wrap gap-2 font-mono text-[10px]">
                    <span>{entry.category ?? "IMPROVEMENT"}</span>
                    {(entry.tags ?? []).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    {entry.isPublished && (
                      <a
                        href={`/changelog/${encodeURIComponent(entry.slug ?? `update-${entry.id}`)}`}
                        className="text-signal-blue underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        View article
                      </a>
                    )}
                  </div>
                  {entry.versionSummary && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Summary: {entry.versionSummary}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                  {entry.isPublished ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUnpublishId(entry.id)}
                      title="Unpublish"
                      aria-label={`Unpublish ${entry.text}`}
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPublishId(entry.id)}
                      title="Publish"
                      aria-label={`Publish ${entry.text}`}
                    >
                      <Eye className="text-signal-green h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(entry)}
                    aria-label={`Edit ${entry.text}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteId(entry.id)}
                    className="text-destructive"
                    aria-label={`Delete ${entry.text}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Page {page} of {Math.ceil(total / limit)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(total / limit)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={savePublishOpen}
        onOpenChange={setSavePublishOpen}
        title={editingId ? "Update this published entry?" : "Create and publish this entry?"}
        description="The release note will become visible to users immediately."
        confirmLabel={editingId ? "Update published entry" : "Create and publish"}
        onConfirm={() => persistEntry(true)}
      />
      <ConfirmDialog
        open={Boolean(publishId)}
        onOpenChange={(open) => {
          if (!open) setPublishId(null);
        }}
        title="Publish changelog entry?"
        description="This release note will become visible to users immediately."
        confirmLabel="Publish entry"
        onConfirm={() => (publishId ? publish(publishId) : undefined)}
      />
      <ConfirmDialog
        open={Boolean(unpublishId)}
        onOpenChange={(open) => {
          if (!open) setUnpublishId(null);
        }}
        title="Unpublish changelog entry?"
        description="This release note will no longer be visible to users. You can publish it again later."
        confirmLabel="Unpublish entry"
        onConfirm={() => (unpublishId ? unpublish(unpublishId) : undefined)}
      />
      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete changelog entry?"
        description="This release note will be permanently removed."
        confirmLabel="Delete entry"
        destructive
        onConfirm={() => (deleteId ? remove(deleteId) : undefined)}
      />
    </div>
  );
}
