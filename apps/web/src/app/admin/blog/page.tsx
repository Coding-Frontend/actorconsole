import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AdminApiError, AdminPagination } from "@/components/admin/admin-pagination";
import { AdminRegistryFilters } from "@/components/admin/admin-registry-filters";

interface SearchParams extends Record<string, string | undefined> {
  q?: string;
  status?: string;
  sort?: string;
  order?: string;
  limit?: string;
  page?: string;
}

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100].includes(requestedLimit) ? requestedLimit : 50;
  const res = await api<{ items: any[]; total: number; page: number; limit: number }>(
    "/admin/blog",
    {
      params: {
        search: params.q || undefined,
        status: params.status || undefined,
        sort: params.sort || undefined,
        order: params.order || undefined,
        page,
        limit,
      },
    },
  );
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Blog" description="CMS for /blog posts." />
        <AdminApiError message={res.error.message ?? "Failed to load blog posts"} />
      </div>
    );
  }
  const data = res.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog"
        description="CMS for /blog posts."
        actions={
          <Button asChild>
            <Link href="/admin/blog/new">
              <Plus className="h-4 w-4" />
              New post
            </Link>
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <AdminRegistryFilters
          path="/admin/blog"
          params={params}
          searchPlaceholder="Title, slug, or excerpt"
          filters={[
            {
              name: "status",
              label: "Statuses",
              options: [
                { value: "DRAFT", label: "Draft" },
                { value: "PUBLISHED", label: "Published" },
                { value: "ARCHIVED", label: "Archived" },
              ],
            },
          ]}
          sorts={[
            { value: "createdAt", label: "Created" },
            { value: "updatedAt", label: "Updated" },
            { value: "publishedAt", label: "Published" },
            { value: "title", label: "Title" },
            { value: "status", label: "Status" },
          ]}
          defaultSort="createdAt"
        />
        {data.items.length === 0 ? (
          <div className="text-muted-foreground p-8 text-center text-sm">No blog posts yet.</div>
        ) : (
          <ul className="divide-border/40 divide-y">
            {data.items.map((post: any) => (
              <li key={post.id}>
                <Link
                  href={`/admin/blog/${post.id}`}
                  className="hover:bg-muted/20 flex items-center justify-between p-4 transition-colors"
                >
                  <div>
                    <p className="font-medium">{post.title}</p>
                    <p className="text-muted-foreground text-xs">
                      /blog/{post.slug} · {formatDate(post.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={post.status === "PUBLISHED" ? "success" : "secondary"}>
                      {post.status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">Edit →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <AdminPagination
        path="/admin/blog"
        page={page}
        total={data.total}
        limit={limit}
        query={{ ...params, page: undefined, limit: String(limit) }}
      />
    </div>
  );
}
