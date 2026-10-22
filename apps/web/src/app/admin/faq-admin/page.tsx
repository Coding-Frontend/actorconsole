"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-header";
import { ClientCollectionControls } from "@/components/admin/client-collection-controls";
import { api } from "@/lib/admin/api";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Pencil, Save, X, ArrowUp, ArrowDown } from "lucide-react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
  published: boolean;
}

export default function AdminFaqPage() {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("General");
  const [saving, startSave] = useTransition();
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [loadError, setLoadError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<FaqItem | null>(null);
  const [query, setQuery] = useState("");
  const [publicationFilter, setPublicationFilter] = useState("");
  const [sort, setSort] = useState("order");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<FaqItem[]>("/admin/faq").then((r) => {
      if (r.ok) setItems(r.data);
      else setLoadError(r.error.message ?? "Could not load FAQ entries");
      setLoading(false);
    });
  }, []);

  function create() {
    startSave(async () => {
      const res = await api("/admin/faq", {
        method: "POST",
        body: JSON.stringify({
          question,
          answer,
          category,
          order:
            Math.max(
              0,
              ...items.filter((item) => item.category === category).map((item) => item.order),
            ) + 1,
          published: false,
        }),
      });
      if (!res.ok) {
        toast.error("Failed");
        return;
      }
      toast.success("FAQ draft created");
      setQuestion("");
      setAnswer("");
      const refresh = await api<FaqItem[]>("/admin/faq");
      if (refresh.ok) setItems(refresh.data);
    });
  }

  async function remove(id: string) {
    const response = await api(`/admin/faq/${id}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(response.error.message ?? "Failed to delete FAQ item");
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Deleted");
  }

  function saveEdit() {
    if (!editing) return;
    startSave(async () => {
      const response = await api<FaqItem>(`/admin/faq/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          question: editing.question,
          answer: editing.answer,
          category: editing.category,
        }),
      });
      if (!response.ok) {
        toast.error(response.error.message ?? "Could not update FAQ entry");
        return;
      }
      setItems((current) => current.map((item) => (item.id === editing.id ? response.data : item)));
      setEditing(null);
      toast.success("FAQ updated");
    });
  }

  async function move(item: FaqItem, direction: -1 | 1) {
    const categoryItems = items.filter((candidate) => candidate.category === item.category);
    const index = categoryItems.findIndex((candidate) => candidate.id === item.id);
    const neighbor = categoryItems[index + direction];
    if (!neighbor) return;
    const [itemResponse, neighborResponse] = await Promise.all([
      api<FaqItem>(`/admin/faq/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ order: neighbor.order }),
      }),
      api<FaqItem>(`/admin/faq/${neighbor.id}`, {
        method: "PATCH",
        body: JSON.stringify({ order: item.order }),
      }),
    ]);
    if (!itemResponse.ok || !neighborResponse.ok) {
      toast.error("Could not reorder FAQ entries");
      return;
    }
    setItems((current) =>
      current
        .map((candidate) => {
          if (candidate.id === item.id) return itemResponse.data;
          if (candidate.id === neighbor.id) return neighborResponse.data;
          return candidate;
        })
        .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order),
    );
  }

  async function togglePublished(item: FaqItem) {
    const response = await api(`/admin/faq/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ published: !item.published }),
    });
    if (!response.ok) {
      const message = response.error.message ?? "Could not update FAQ publication state";
      toast.error(message);
      throw new Error(message);
    }
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, published: !item.published } : candidate,
      ),
    );
    toast.success(item.published ? "FAQ moved to draft" : "FAQ published");
  }

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (publicationFilter === "published" && !item.published) return false;
        if (publicationFilter === "draft" && item.published) return false;
        return (
          !normalizedQuery ||
          [item.question, item.answer, item.category].some((value) =>
            value.toLowerCase().includes(normalizedQuery),
          )
        );
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sort === "question") comparison = a.question.localeCompare(b.question);
        else if (sort === "category") comparison = a.category.localeCompare(b.category);
        else if (sort === "published") comparison = Number(a.published) - Number(b.published);
        else comparison = a.category.localeCompare(b.category) || a.order - b.order;
        return sortOrder === "asc" ? comparison : -comparison;
      });
  }, [items, publicationFilter, query, sort, sortOrder]);
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = visibleItems.slice((currentPage - 1) * limit, currentPage * limit);
  const byCategory = new Map<string, FaqItem[]>();
  for (const item of pagedItems) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category)!.push(item);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="FAQ" description="Manage frequently asked questions." />

      {loadError ? (
        <p role="alert" className="text-destructive rounded-md border p-3 text-sm">
          {loadError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add question</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={category}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCategory(e.target.value)}
                placeholder="e.g. General"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Question</Label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="How do I connect Apify?"
            />
          </div>
          <div className="space-y-2">
            <Label>Answer</Label>
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} />
          </div>
          <Button onClick={create} disabled={saving || !question || !answer}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </CardContent>
      </Card>

      <ClientCollectionControls
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        searchPlaceholder="Search question, answer, or category"
        filterLabel="Publication"
        filterValue={publicationFilter}
        onFilterChange={(value) => {
          setPublicationFilter(value);
          setPage(1);
        }}
        filterOptions={[
          { value: "published", label: "Published" },
          { value: "draft", label: "Draft" },
        ]}
        sortValue={sort}
        onSortChange={(value) => {
          setSort(value);
          setPage(1);
        }}
        sortOptions={[
          { value: "order", label: "Display order" },
          { value: "question", label: "Question" },
          { value: "category", label: "Category" },
          { value: "published", label: "Publication" },
        ]}
        order={sortOrder}
        onOrderChange={(value) => {
          setSortOrder(value);
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
          setPublicationFilter("");
          setSort("order");
          setSortOrder("asc");
          setLimit(25);
          setPage(1);
        }}
      />

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : visibleItems.length === 0 ? (
        <p className="text-muted-foreground text-sm">No FAQ entries match these filters.</p>
      ) : (
        Array.from(byCategory.entries()).map(([cat, catItems]) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-sm font-semibold capitalize">{cat}</h3>
            {catItems.map((item) => {
              const allCategoryItems = items.filter(
                (candidate) => candidate.category === item.category,
              );
              const fullIndex = allCategoryItems.findIndex((candidate) => candidate.id === item.id);
              return (
                <Card key={item.id}>
                  <CardContent className="flex items-start justify-between p-4">
                    {editing?.id === item.id ? (
                      <div className="mr-3 flex-1 space-y-2">
                        <Input
                          aria-label="FAQ category"
                          value={editing.category}
                          onChange={(event) =>
                            setEditing({ ...editing, category: event.target.value })
                          }
                        />
                        <Input
                          aria-label="FAQ question"
                          value={editing.question}
                          onChange={(event) =>
                            setEditing({ ...editing, question: event.target.value })
                          }
                        />
                        <Textarea
                          aria-label="FAQ answer"
                          rows={4}
                          value={editing.answer}
                          onChange={(event) =>
                            setEditing({ ...editing, answer: event.target.value })
                          }
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit} disabled={saving}>
                            <Save className="h-3.5 w-3.5" /> Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <p className="font-medium">{item.question}</p>
                        <p className="text-muted-foreground mt-1 whitespace-pre-wrap text-sm">
                          {item.answer}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPublishTarget(item)}
                        aria-label={`${item.published ? "Move to draft" : "Publish"}: ${item.question}`}
                      >
                        <Badge variant={item.published ? "success" : "secondary"}>
                          {item.published ? "Published" : "Draft"}
                        </Badge>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${item.question} up`}
                        onClick={() => void move(item, -1)}
                        disabled={sort !== "order" || sortOrder !== "asc" || fullIndex === 0}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${item.question} down`}
                        onClick={() => void move(item, 1)}
                        disabled={
                          sort !== "order" ||
                          sortOrder !== "asc" ||
                          fullIndex === allCategoryItems.length - 1
                        }
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${item.question}`}
                        onClick={() => setEditing({ ...item })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(item.id)}
                        className="text-destructive"
                        aria-label={`Delete ${item.question}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}
      <ConfirmDialog
        open={Boolean(publishTarget)}
        onOpenChange={(open) => {
          if (!open) setPublishTarget(null);
        }}
        title={publishTarget?.published ? "Move this FAQ to draft?" : "Publish this FAQ?"}
        description={
          publishTarget?.published
            ? "The answer will be removed from the public FAQ immediately."
            : "The answer will become visible on the public FAQ immediately."
        }
        confirmLabel={publishTarget?.published ? "Move to draft" : "Publish FAQ"}
        onConfirm={() => (publishTarget ? togglePublished(publishTarget) : undefined)}
      />
      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete FAQ entry?"
        description="This FAQ entry will be permanently removed from the admin and public pages."
        confirmLabel="Delete entry"
        destructive
        onConfirm={() => (deleteId ? remove(deleteId) : undefined)}
      />
    </div>
  );
}
