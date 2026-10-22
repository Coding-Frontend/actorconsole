import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { policyMetaBySlug } from "@actorconsole/shared";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PolicyEditor } from "@/components/admin/policy-editor";
import { AdminApiError } from "@/components/admin/admin-pagination";

interface Policy {
  id: string;
  slug: string;
  version: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  title: string;
  body: string;
  publishedAt: string | null;
  updatedAt: string;
}

export default async function PolicySlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = policyMetaBySlug(slug);
  if (!meta) notFound();

  const res = await api<Policy[]>(`/admin/policies/${meta.slug}`);
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title={meta.title} description={meta.summary} />
        <AdminApiError message={res.error.message ?? "Failed to load policy versions"} />
      </div>
    );
  }
  const versions = res.data;
  const sorted = [...versions].sort((a, b) => b.version.localeCompare(a.version));

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/policies">
            <ArrowLeft className="mr-1 h-4 w-4" /> All policies
          </Link>
        </Button>
      </div>
      <PageHeader
        title={meta.title}
        description={meta.summary}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={meta.path} target="_blank">
              <ExternalLink className="mr-1 h-3 w-3" /> View public
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <PolicyEditor slug={meta.slug} versions={sorted} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Version history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sorted.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs">v{v.version}</span>
                <Badge
                  variant={
                    v.status === "PUBLISHED"
                      ? "success"
                      : v.status === "ARCHIVED"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {v.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
