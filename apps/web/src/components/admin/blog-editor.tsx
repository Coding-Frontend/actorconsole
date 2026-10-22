"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { toast } from "sonner";
import { api } from "@/lib/admin/api";
import { useRouter } from "next/navigation";

interface BlogEditorProps {
  initialData?: {
    id: string;
    slug: string;
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    seoTitle: string;
    seoDescription: string;
    tags: string[];
    readingMinutes?: number;
  };
}

export function BlogEditor({ initialData }: BlogEditorProps = {}) {
  const router = useRouter();
  const isEdit = !!initialData;
  const editable = initialData?.status !== "ARCHIVED";
  const [pending, startTransition] = useTransition();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [form, setForm] = useState({
    slug: initialData?.slug ?? "",
    title: initialData?.title ?? "",
    excerpt: initialData?.excerpt ?? "",
    content: initialData?.content ?? "",
    status: initialData?.status ?? ("DRAFT" as "DRAFT" | "PUBLISHED" | "ARCHIVED"),
    tags: initialData?.tags?.join(", ") ?? "",
    coverImage: initialData?.coverImage ?? "",
    seoTitle: initialData?.seoTitle ?? "",
    seoDescription: initialData?.seoDescription ?? "",
    readingMinutes: initialData?.readingMinutes?.toString() ?? "",
  });

  async function submit(status: "DRAFT" | "PUBLISHED", throwOnError = false) {
    if (!form.slug || !form.title || !form.content) {
      const message = "Slug, title, and content are required";
      toast.error(message);
      if (throwOnError) throw new Error(message);
      return;
    }
    const method = isEdit ? "PUT" : "POST";
    const url = isEdit ? `/admin/blog/${initialData!.id}` : "/admin/blog";
    const res = await api(url, {
      method,
      body: JSON.stringify({
        ...form,
        status: form.status === "ARCHIVED" ? form.status : status,
        tags: form.tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        coverImage: form.coverImage || undefined,
        seoTitle: form.seoTitle || undefined,
        seoDescription: form.seoDescription || undefined,
        readingMinutes: form.readingMinutes ? Number(form.readingMinutes) : undefined,
      }),
    });
    if (!res.ok) {
      const message = res.error?.message ?? "Failed to save";
      toast.error(message);
      if (throwOnError) throw new Error(message);
      return;
    }
    toast.success(isEdit ? "Updated!" : status === "PUBLISHED" ? "Published!" : "Saved as draft");
    router.push("/admin/blog");
  }

  async function archive() {
    if (!initialData) {
      return;
    }
    const res = await api(`/admin/blog/${initialData.id}`, { method: "DELETE" });
    if (!res.ok) {
      const message = res.error.message ?? "Failed to archive post";
      toast.error(message);
      throw new Error(message);
    }
    toast.success("Post archived");
    router.push("/admin/blog");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="my-new-post"
            disabled={!editable}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tags">Tags (comma-separated)</Label>
          <Input
            id="tags"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="announcement, product"
            disabled={!editable}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Post title…"
          disabled={!editable}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="coverImage">Cover image URL</Label>
          <Input
            id="coverImage"
            type="url"
            value={form.coverImage}
            onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
            placeholder="https://…"
            disabled={!editable}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="readingMinutes">Reading time (minutes)</Label>
          <Input
            id="readingMinutes"
            type="number"
            min="1"
            value={form.readingMinutes}
            onChange={(e) => setForm({ ...form, readingMinutes: e.target.value })}
            disabled={!editable}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="seoTitle">SEO title</Label>
          <Input
            id="seoTitle"
            value={form.seoTitle}
            onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
            disabled={!editable}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seoDescription">SEO description</Label>
          <Input
            id="seoDescription"
            value={form.seoDescription}
            onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
            disabled={!editable}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="excerpt">Excerpt</Label>
        <Input
          id="excerpt"
          value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
          placeholder="Short summary…"
          disabled={!editable}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="content">Content (Markdown)</Label>
        <Textarea
          id="content"
          rows={16}
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="Write your post in Markdown…"
          disabled={!editable}
        />
      </div>
      {!editable ? (
        <p className="text-muted-foreground rounded-md border p-3 text-sm">
          Archived posts are read-only. Create a new post if this content should be published again.
        </p>
      ) : null}
      {editable ? <div className="flex gap-2">
        <Button
          disabled={pending}
          onClick={() => startTransition(() => submit("DRAFT"))}
          variant="outline"
        >
          Save as draft
        </Button>
        <Button disabled={pending} onClick={() => setPublishOpen(true)}>
          Publish
        </Button>
        {isEdit && form.status !== "ARCHIVED" ? (
          <Button disabled={pending} variant="destructive" onClick={() => setArchiveOpen(true)}>
            Archive
          </Button>
        ) : null}
      </div> : null}
      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish this blog post?"
        description="The post will become visible on the public blog immediately."
        confirmLabel="Publish post"
        onConfirm={() => submit("PUBLISHED", true)}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this post?"
        description="The post will disappear from the public blog and remain available in the admin area."
        confirmLabel="Archive post"
        destructive
        onConfirm={archive}
      />
    </div>
  );
}
