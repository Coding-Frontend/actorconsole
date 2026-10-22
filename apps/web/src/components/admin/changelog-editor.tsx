"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Loader2, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangelogArticleContent } from "@/components/marketing/changelog-article";
import { CHANGELOG_CATEGORIES, CHANGELOG_PRODUCT_TAGS, tagLabel } from "@/lib/changelog";
import type { ChangelogCategory, ChangelogType } from "@/services/changelog";

export interface ChangelogForm {
  title: string;
  slug: string;
  text: string;
  body: string;
  category: ChangelogCategory;
  tags: string[];
  type: ChangelogType;
  version: string;
  releaseDate: string;
  versionSummary: string;
  sortOrder: number;
  isPublished: boolean;
}
export const newChangelogForm = (): ChangelogForm => ({
  title: "",
  slug: "",
  text: "",
  body: "",
  category: "RELEASE",
  tags: [],
  type: "FEATURE",
  version: "Unreleased",
  releaseDate: new Date().toISOString().slice(0, 10),
  versionSummary: "",
  sortOrder: 0,
  isPublished: false,
});
const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200)
    .replace(/-$/, "");
const selectClass =
  "border-input bg-card focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2";

export function ChangelogEditor({
  form,
  setForm,
  editing,
  saving,
  onSave,
  onCancel,
}: {
  form: ChangelogForm;
  setForm: Dispatch<SetStateAction<ChangelogForm>>;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [slugEdited, setSlugEdited] = useState(editing);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const [customTags, setCustomTags] = useState(
    form.tags.filter((tag) => !CHANGELOG_PRODUCT_TAGS.includes(tag)).join(", "),
  );
  const valid = Boolean(
    form.title.trim() &&
    form.text.trim() &&
    form.releaseDate &&
    form.version.trim() &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) &&
    !["feed", "entries", "health"].includes(form.slug) &&
    form.tags.length <= 12,
  );
  const update = <K extends keyof ChangelogForm>(key: K, value: ChangelogForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSave();
      }}
      className="space-y-6"
    >
      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Write
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="mr-2 h-3.5 w-3.5" />
            Article preview
          </TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="space-y-5">
          <div>
            <Label htmlFor="changelog-title">Title</Label>
            <Input
              id="changelog-title"
              ref={titleRef}
              value={form.title}
              maxLength={240}
              required
              placeholder="A clear headline for this update"
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  title: event.target.value,
                  slug: slugEdited ? previous.slug : slugify(event.target.value),
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="changelog-slug">URL slug</Label>
            <Input
              id="changelog-slug"
              value={form.slug}
              maxLength={200}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              readOnly={editing}
              aria-describedby="changelog-slug-help"
              placeholder="new-dashboard-experience"
              onChange={(event) => {
                setSlugEdited(true);
                update("slug", event.target.value);
              }}
            />
            <p
              id="changelog-slug-help"
              className="text-muted-foreground mt-2 break-all font-mono text-xs"
            >
              /changelog/{form.slug || "your-update"}
              {editing
                ? " · URL is fixed to keep shared links working."
                : " · Use lowercase letters, numbers, and hyphens. feed, entries, and health are reserved."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="changelog-category">Public category</Label>
              <select
                id="changelog-category"
                value={form.category}
                onChange={(event) => update("category", event.target.value as ChangelogCategory)}
                className={selectClass}
              >
                {Object.entries(CHANGELOG_CATEGORIES).map(([value, { label }]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="changelog-type">Change type</Label>
              <select
                id="changelog-type"
                value={form.type}
                onChange={(event) => update("type", event.target.value as ChangelogType)}
                className={selectClass}
              >
                <option value="FEATURE">Feature</option>
                <option value="FIX">Fix</option>
                <option value="PERF">Performance</option>
                <option value="SECURITY">Security</option>
                <option value="UI">UI</option>
                <option value="CHORE">Maintenance</option>
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="mb-3 text-sm font-medium">Product areas</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CHANGELOG_PRODUCT_TAGS.map((tag) => (
                <label
                  key={tag}
                  className="border-border flex items-center gap-2 rounded-sm border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-signal-orange h-4 w-4"
                    checked={form.tags.includes(tag)}
                    onChange={(event) =>
                      update(
                        "tags",
                        event.target.checked
                          ? [...new Set([...form.tags, tag])]
                          : form.tags.filter((value) => value !== tag),
                      )
                    }
                  />
                  {tagLabel(tag)}
                </label>
              ))}
            </div>
            <div className="mt-4">
              <Label htmlFor="changelog-custom-tags">Additional areas (comma separated)</Label>
              <Input
                id="changelog-custom-tags"
                value={customTags}
                maxLength={700}
                placeholder="workflows, developer-experience"
                aria-describedby="changelog-tag-help"
                onChange={(event) => {
                  setCustomTags(event.target.value);
                  const custom = event.target.value.split(",").map(slugify).filter(Boolean);
                  update("tags", [
                    ...new Set([
                      ...form.tags.filter((tag) => CHANGELOG_PRODUCT_TAGS.includes(tag)),
                      ...custom,
                    ]),
                  ]);
                }}
              />
              <p
                id="changelog-tag-help"
                className={`mt-2 text-xs ${form.tags.length > 12 || form.tags.some((tag) => tag.length > 64) ? "text-destructive" : "text-muted-foreground"}`}
              >
                Choose up to 12 areas, with at most 64 characters each. {form.tags.length} selected.
              </p>
            </div>
          </fieldset>
          <div>
            <Label htmlFor="changelog-summary">Summary</Label>
            <Textarea
              id="changelog-summary"
              value={form.text}
              maxLength={5000}
              required
              rows={3}
              placeholder="Briefly explain what changed and who benefits."
              onChange={(event) => update("text", event.target.value)}
            />
            <p className="text-muted-foreground mt-2 text-xs">
              Used in the RSS feed and search previews. Existing entry text is preserved here.
            </p>
          </div>
          <div>
            <Label htmlFor="changelog-body">Article body (Markdown)</Label>
            <Textarea
              id="changelog-body"
              value={form.body}
              maxLength={100000}
              rows={14}
              className="font-mono text-sm"
              placeholder="## What changed\n\nExplain the update, include examples, and link to documentation."
              onChange={(event) => update("body", event.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">Insert:</span>
              {[
                { label: "Heading", markdown: "\n\n## What changed\n" },
                { label: "Link", markdown: "\n\n[Documentation](https://example.com)\n" },
                {
                  label: "Screenshot",
                  markdown: "\n\n![Describe this screenshot](https://example.com/screenshot.png)\n",
                },
                { label: "Code example", markdown: "\n\n```javascript\n// Your example\n```\n" },
              ].map(({ label, markdown }) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => update("body", form.body + markdown)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Headings, lists, tables, links, images, and fenced code blocks are supported. If
              empty, the article uses the summary.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="preview">
          <div className="border-border bg-background rounded-md border p-5 sm:p-8">
            <p className="text-signal-orange mb-6 font-mono text-xs uppercase tracking-wide">
              Preview · {form.isPublished ? "Published update" : "Draft"}
            </p>
            <ChangelogArticleContent
              entry={{
                ...form,
                title: form.title || "Your update title",
                id: "preview",
                releaseDate: form.releaseDate || new Date().toISOString().slice(0, 10),
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
      <div className="border-border grid gap-4 border-t pt-5 sm:grid-cols-3">
        <div>
          <Label htmlFor="changelog-version">Version</Label>
          <Input
            id="changelog-version"
            value={form.version}
            maxLength={64}
            required
            onChange={(event) => update("version", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="changelog-date">Release date</Label>
          <Input
            id="changelog-date"
            type="date"
            value={form.releaseDate}
            required
            min="2000-01-01"
            max="9998-12-31"
            onChange={(event) => update("releaseDate", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="changelog-order">Sort order</Label>
          <Input
            id="changelog-order"
            type="number"
            min={-1000}
            max={1000}
            value={form.sortOrder}
            onChange={(event) => update("sortOrder", Number(event.target.value))}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="changelog-version-summary">Version summary (optional)</Label>
        <Input
          id="changelog-version-summary"
          value={form.versionSummary}
          maxLength={500}
          onChange={(event) => update("versionSummary", event.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-signal-orange h-4 w-4"
          checked={form.isPublished}
          onChange={(event) => update("isPublished", event.target.checked)}
        />
        {editing ? "Published" : "Publish when saved"}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={saving || !valid || form.tags.some((tag) => tag.length > 64)}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {form.isPublished
            ? editing
              ? "Save published update"
              : "Create and publish"
            : "Save draft"}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
