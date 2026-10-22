"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Save, Send, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { api } from "@/lib/admin/api";

interface Policy {
  id: string;
  slug: string;
  version: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  title: string;
  body: string;
}

function defaultTitle(slug: string) {
  return slug.charAt(0) + slug.slice(1).toLowerCase();
}

export function PolicyEditor({ slug, versions }: { slug: string; versions: Policy[] }) {
  const router = useRouter();
  const initial = versions[0];
  const [version, setVersion] = useState(initial?.version ?? "1.0.0");
  const [creatingNew, setCreatingNew] = useState(!initial);
  const [title, setTitle] = useState(initial?.title ?? defaultTitle(slug));
  const [body, setBody] = useState(initial?.body ?? "## Section\n\nWrite the policy here.");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const selected = creatingNew ? undefined : versions.find((item) => item.version === version);
  const editable = creatingNew || selected?.status === "DRAFT";

  async function save(asStatus: "DRAFT" | "PUBLISHED", throwOnError = false) {
    setSaving(true);
    setError(null);
    try {
      const saveRes = await api(
        creatingNew
          ? `/admin/policies/${slug}/drafts`
          : `/admin/policies/${slug}/versions/${version}`,
        {
          method: creatingNew ? "POST" : "PUT",
          body: JSON.stringify({ title, body, version }),
        },
      );
      if (!saveRes.ok) {
        const message = saveRes.error.message ?? "Save failed";
        setError(message);
        if (throwOnError) throw new Error(message);
        return;
      }

      if (asStatus === "PUBLISHED") {
        const publishRes = await api(`/admin/policies/${slug}/versions/${version}/publish`, {
          method: "POST",
        });
        if (!publishRes.ok) {
          const message =
            publishRes.error.message ?? "The draft was saved but could not be published";
          setError(message);
          if (throwOnError) throw new Error(message);
          return;
        }
      }

      setCreatingNew(false);
      router.refresh();
    } catch (caught) {
      const saveError = caught instanceof Error ? caught : new Error("Unknown error");
      setError(saveError.message);
      if (throwOnError) throw saveError;
    } finally {
      setSaving(false);
    }
  }

  async function deleteVersion() {
    if (creatingNew || !selected) return;
    setSaving(true);
    setError(null);
    const res = await api(`/admin/policies/${slug}/versions/${version}`, { method: "DELETE" });
    if (!res.ok) {
      const message = res.error.message ?? "Delete failed";
      setError(message);
      setSaving(false);
      throw new Error(message);
    }
    router.refresh();
    setSaving(false);
  }

  function selectVersion(value: string) {
    if (value === "new") {
      setCreatingNew(true);
      setVersion("1.0.0");
      setTitle(defaultTitle(slug));
      setBody("## Section\n\nWrite the policy here.");
      return;
    }
    const policy = versions.find((item) => item.version === value);
    if (!policy) return;
    setCreatingNew(false);
    setVersion(policy.version);
    setTitle(policy.title);
    setBody(policy.body);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <label htmlFor="policy-version" className="text-sm font-medium">
          Version:
        </label>
        <select
          id="policy-version"
          value={creatingNew ? "new" : version}
          onChange={(event) => selectVersion(event.target.value)}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          {versions.map((item) => (
            <option key={item.id} value={item.version}>
              v{item.version} ({item.status.toLowerCase()})
            </option>
          ))}
          <option value="new">+ New version</option>
        </select>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving || creatingNew || selected?.status !== "DRAFT"}
          onClick={() => setArchiveOpen(true)}
          aria-label="Archive draft version"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {creatingNew ? (
        <div className="max-w-xs space-y-2">
          <label htmlFor="new-policy-version" className="text-sm font-medium">
            New semantic version
          </label>
          <input
            id="new-policy-version"
            className="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            placeholder="1.0.0"
          />
        </div>
      ) : null}

      {!editable ? (
        <p className="text-muted-foreground text-sm">
          Published and archived versions are immutable. Select “New version” to make changes.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="policy-title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="policy-title"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!editable}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="policy-body" className="text-sm font-medium">
            Markdown body
          </label>
          <textarea
            id="policy-body"
            className="border-input bg-background h-[400px] w-full rounded-md border p-3 font-mono text-xs"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!editable}
          />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent className="policy-content min-w-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button disabled={saving || !editable} onClick={() => save("DRAFT")} variant="outline">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save draft
        </Button>
        <Button disabled={saving || !editable} onClick={() => setPublishOpen(true)}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Publish
        </Button>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish this policy version?"
        description="This version will become the public policy immediately and can no longer be edited."
        confirmLabel="Publish policy"
        onConfirm={() => save("PUBLISHED", true)}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this draft version?"
        description="This draft will no longer be available for editing as the active version."
        confirmLabel="Archive version"
        destructive
        onConfirm={deleteVersion}
      />
    </div>
  );
}
