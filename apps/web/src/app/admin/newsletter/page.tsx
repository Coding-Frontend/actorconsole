"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/api";
import { formatDate } from "@/lib/utils";
import {
  Search,
  Mail,
  Trash2,
  Download,
  Loader2,
  Users,
  UserX,
  AlertTriangle,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: "ACTIVE" | "UNSUBSCRIBED" | "BOUNCED";
  subscribedAt: string;
  unsubscribedAt: string | null;
}

interface Stats {
  active: number;
  unsubscribed: number;
  bounced: number;
  total: number;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  publishedAt: string | null;
}

interface Campaign {
  id: string;
  subject: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  error: string | null;
  createdAt: string;
}

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-signal-green/10 text-signal-green",
  UNSUBSCRIBED: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  BOUNCED: "bg-destructive/10 text-destructive",
};

export default function AdminNewsletterPage() {
  const [items, setItems] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("subscribedAt");
  const [order, setOrder] = useState("desc");
  const [limit, setLimit] = useState(50);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [newsletterTitle, setNewsletterTitle] = useState("ActorConsole digest");
  const [sending, setSending] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchData = useCallback(
    async (
      q = "",
      status = "",
      requestedPage = 1,
      requestedSort = "subscribedAt",
      requestedOrder = "desc",
      requestedLimit = 50,
    ) => {
      const currentRequest = ++requestId.current;
      setLoading(true);
      setError("");
      const [itemsRes, statsRes, postsRes, campaignsRes] = await Promise.all([
        api<{ items: Subscriber[]; total: number }>("/admin/newsletter", {
          params: {
            search: q || undefined,
            status: status || undefined,
            sort: requestedSort,
            order: requestedOrder,
            page: requestedPage,
            limit: requestedLimit,
          },
        }),
        api<Stats>("/admin/newsletter/stats"),
        api<{ items: BlogPost[] }>("/admin/blog", {
          params: { status: "PUBLISHED", sort: "publishedAt", order: "desc", limit: 100 },
        }),
        api<Campaign[]>("/admin/newsletter/campaigns"),
      ]);
      if (currentRequest !== requestId.current) return;
      if (itemsRes.ok) {
        const totalPages = Math.max(1, Math.ceil(itemsRes.data.total / requestedLimit));
        if (requestedPage > totalPages) {
          setPage(totalPages);
          setLoading(false);
          void fetchData(q, status, totalPages, requestedSort, requestedOrder, requestedLimit);
          return;
        }
        setItems(itemsRes.data.items);
        setTotal(itemsRes.data.total);
        setPage(requestedPage);
      }
      if (statsRes.ok) setStats(statsRes.data);
      if (postsRes.ok) setPosts(postsRes.data.items);
      if (campaignsRes.ok) setCampaigns(campaignsRes.data);
      const failed = [itemsRes, statsRes, postsRes, campaignsRes].find((result) => !result.ok);
      if (failed && !failed.ok) setError(failed.error.message ?? "Could not load newsletter data");
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const res = await api(`/admin/newsletter/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Subscriber removed");
      fetchData(search, statusFilter, page, sort, order, limit);
    } else {
      const message = res.error.message ?? "Failed to remove subscriber";
      toast.error(message);
      setDeleting(null);
      throw new Error(message);
    }
    setDeleting(null);
  };

  const sendCampaign = async () => {
    const selected = posts.filter((post) => selectedPosts.includes(post.id));
    if (!subject.trim() || !newsletterTitle.trim() || selected.length === 0) {
      throw new Error("Add a subject, a digest heading, and at least one published article");
    }
    setSending(true);
    try {
      const origin = window.location.origin;
      const res = await api<Campaign>("/admin/newsletter/send", {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          subject: subject.trim(),
          title: newsletterTitle.trim(),
          articles: selected.map((post) => ({
            title: post.title,
            url: `${origin}/blog/${post.slug}`,
            excerpt: post.excerpt ?? "Read the latest update from ActorConsole.",
            publishedAt: post.publishedAt ?? undefined,
          })),
        }),
      });
      if (!res.ok) throw new Error(res.error.message ?? "Could not queue newsletter");
      toast.success("Newsletter queued for delivery");
      setSubject("");
      setSelectedPosts([]);
      await fetchData(search, statusFilter, page, sort, order, limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not queue newsletter";
      toast.error(message);
      throw error;
    } finally {
      setSending(false);
    }
  };

  const handleExport = () => {
    const csv = [
      "Email,Name,Status,Subscribed At,Unsubscribed At",
      ...items.map((s) =>
        [s.email, s.name ?? "", s.status, s.subscribedAt, s.unsubscribedAt ?? ""].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Newsletter"
        description={`${stats?.total ?? 0} total subscribers`}
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0}>
            <Download className="mr-1 h-4 w-4" />
            Export current page
          </Button>
        }
      />

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm"
        >
          {error}
        </div>
      ) : null}

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="bg-signal-green/10 text-signal-green flex h-10 w-10 items-center justify-center rounded-lg">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Active</p>
              <p className="text-2xl font-bold tabular-nums">{stats?.active ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-500/10 text-zinc-700 dark:text-zinc-300">
              <UserX className="h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Unsubscribed</p>
              <p className="text-2xl font-bold tabular-nums">{stats?.unsubscribed ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="bg-destructive/10 text-destructive flex h-10 w-10 items-center justify-center rounded-lg">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Bounced</p>
              <p className="text-2xl font-bold tabular-nums">{stats?.bounced ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="bg-signal-blue/10 text-signal-blue flex h-10 w-10 items-center justify-center rounded-lg">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="text-2xl font-bold tabular-nums">{stats?.total ?? 0}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Send a digest</h2>
          <p className="text-muted-foreground text-sm">
            Delivery runs in the worker queue with per-recipient unsubscribe links and delivery
            tracking.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Email subject"
            maxLength={200}
          />
          <Input
            value={newsletterTitle}
            onChange={(event) => setNewsletterTitle(event.target.value)}
            placeholder="Digest heading"
            maxLength={200}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Published articles</legend>
          {posts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Publish a blog post before sending a digest.
            </p>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  id={`newsletter-post-${post.id}`}
                  type="checkbox"
                  className="mt-1"
                  checked={selectedPosts.includes(post.id)}
                  onChange={(event) =>
                    setSelectedPosts((current) =>
                      event.target.checked
                        ? [...current, post.id]
                        : current.filter((id) => id !== post.id),
                    )
                  }
                />
                <label htmlFor={`newsletter-post-${post.id}`} className="cursor-pointer">
                  <span className="font-medium">{post.title}</span>
                  <span className="text-muted-foreground mt-1 line-clamp-2 block">
                    {post.excerpt ?? "No excerpt"}
                  </span>
                </label>
              </div>
            ))
          )}
        </fieldset>
        <Button
          onClick={() => setSendOpen(true)}
          disabled={
            sending || selectedPosts.length === 0 || !subject.trim() || !newsletterTitle.trim()
          }
        >
          {sending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1 h-4 w-4" />
          )}
          Queue digest
        </Button>
      </Card>

      {campaigns.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Recent campaigns</h2>
          <div className="space-y-2">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{campaign.subject}</p>
                  <p className="text-muted-foreground text-xs">{formatDate(campaign.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{campaign.status}</p>
                  <p className="text-muted-foreground text-xs">
                    {campaign.sentCount} sent · {campaign.failedCount} failed ·{" "}
                    {campaign.totalRecipients} total
                  </p>
                </div>
                {campaign.error ? (
                  <p className="text-destructive basis-full text-xs">{campaign.error}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Search & filter */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-2.5 h-4 w-4" />
            <Input
              placeholder="Search by email or name..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchData(search, statusFilter, 1, sort, order, limit);
              }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              fetchData(search, e.target.value, 1, sort, order, limit);
            }}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="UNSUBSCRIBED">Unsubscribed</option>
            <option value="BOUNCED">Bounced</option>
          </select>
          <select
            value={sort}
            onChange={(event) => {
              const nextSort = event.target.value;
              setSort(nextSort);
              void fetchData(search, statusFilter, 1, nextSort, order, limit);
            }}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            aria-label="Sort subscribers"
          >
            <option value="subscribedAt">Subscribed date</option>
            <option value="email">Email</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
          </select>
          <select
            value={order}
            onChange={(event) => {
              const nextOrder = event.target.value;
              setOrder(nextOrder);
              void fetchData(search, statusFilter, 1, sort, nextOrder, limit);
            }}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            aria-label="Subscriber sort direction"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <select
            value={limit}
            onChange={(event) => {
              const nextLimit = Number(event.target.value);
              setLimit(nextLimit);
              void fetchData(search, statusFilter, 1, sort, order, nextLimit);
            }}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            aria-label="Subscribers per page"
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
            <option value="200">200 rows</option>
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchData(search, statusFilter, 1, sort, order, limit)}
          >
            <Search className="mr-1 h-4 w-4" />
            Search
          </Button>
        </div>
      </Card>
      {total > limit ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {Math.ceil(total / limit)} · {total} subscribers
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => fetchData(search, statusFilter, page - 1, sort, order, limit)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(total / limit) || loading}
              onClick={() => fetchData(search, statusFilter, page + 1, sort, order, limit)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {/* Subscriber table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center text-sm">
            <Mail className="mx-auto mb-2 h-8 w-8 opacity-50" />
            No subscribers found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subscribed</TableHead>
                <TableHead>Unsubscribed</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.email}</TableCell>
                  <TableCell className="text-muted-foreground">{s.name ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${statusStyles[s.status] ?? ""}`}
                    >
                      {s.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(s.subscribedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {s.unsubscribedAt ? formatDate(s.unsubscribedAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${s.email}`}
                      onClick={() => setDeleteId(s.id)}
                      disabled={deleting === s.id}
                    >
                      {deleting === s.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="text-destructive h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <ConfirmDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title="Send this newsletter digest?"
        description={`Queue “${subject.trim() || "Untitled digest"}” for all active subscribers with ${selectedPosts.length} selected article${selectedPosts.length === 1 ? "" : "s"}.`}
        confirmLabel="Queue digest"
        onConfirm={sendCampaign}
      />
      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Remove subscriber?"
        description={`Remove ${items.find((item) => item.id === deleteId)?.email ?? "this subscriber"} from the newsletter list.`}
        confirmLabel="Remove subscriber"
        destructive
        onConfirm={() => (deleteId ? handleDelete(deleteId) : undefined)}
      />
    </div>
  );
}
