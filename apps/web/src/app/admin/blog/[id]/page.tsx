import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-header";
import { AdminDetailError } from "@/components/admin/admin-pagination";
import { api } from "@/lib/admin/server-api";
import { BlogEditor } from "@/components/admin/blog-editor";
import { ArrowLeft } from "lucide-react";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  coverImage: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  seoTitle: string | null;
  seoDescription: string | null;
  tags: string[];
  readingMinutes: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await api<BlogPost>(`/admin/blog/${id}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <AdminDetailError
        title="Blog post unavailable"
        message={res.error.message}
        backHref="/admin/blog"
        backLabel="Back to blog posts"
      />
    );
  }
  const post = res.data;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/blog">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All posts
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Edit post"
        description={
          <>
            Editing <strong>{post.title}</strong>
            {post.status && (
              <Badge
                variant={post.status === "PUBLISHED" ? "success" : "secondary"}
                className="ml-2"
              >
                {post.status}
              </Badge>
            )}
          </>
        }
      />
      <Card>
        <CardContent className="p-6">
          <BlogEditor
            initialData={{
              id: post.id,
              slug: post.slug,
              title: post.title,
              content: post.content,
              excerpt: post.excerpt ?? "",
              coverImage: post.coverImage ?? "",
              status: post.status,
              seoTitle: post.seoTitle ?? "",
              seoDescription: post.seoDescription ?? "",
              tags: post.tags,
              readingMinutes: post.readingMinutes ?? undefined,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
