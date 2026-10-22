import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { POLICY_META } from "@actorconsole/shared";
import { formatDate } from "@/lib/utils";
import { Scale, CheckCircle2, Clock } from "lucide-react";
import { AdminApiError } from "@/components/admin/admin-pagination";

interface PolicySummary {
  slug: string;
  version: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  title: string;
  publishedAt: string | null;
  updatedAt: string;
}

export default async function AdminPoliciesPage() {
  const res = await api<PolicySummary[]>("/admin/policies");
  if (!res.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Policies" description="Version-controlled legal documents." />
        <AdminApiError message={res.error.message ?? "Failed to load policies"} />
      </div>
    );
  }
  const allVersions: PolicySummary[] = res.data;

  // Group by slug, show latest version + status
  const latestBySlug = new Map<string, PolicySummary>();
  for (const v of allVersions) {
    const existing = latestBySlug.get(v.slug);
    if (!existing || v.version > existing.version) {
      latestBySlug.set(v.slug, v);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policies"
        description="Version-controlled legal documents (Terms, Privacy, Cookies, Refund, AUP, DPA)"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {POLICY_META.map((meta) => {
          const latest = latestBySlug.get(meta.slug);
          return (
            <Link key={meta.slug} href={`/admin/policies/${meta.slug.toLowerCase()}`}>
              <Card className="hover:border-signal-orange/40 hover:shadow-glow h-full transition-all">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="bg-signal-orange/10 text-signal-orange flex h-10 w-10 items-center justify-center rounded-lg">
                      <Scale className="h-5 w-5" />
                    </div>
                    {latest && (
                      <Badge
                        variant={
                          latest.status === "PUBLISHED"
                            ? "success"
                            : latest.status === "DRAFT"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {latest.status}
                      </Badge>
                    )}
                  </div>
                  <h3 className="mt-4 font-semibold">{meta.title}</h3>
                  <p className="text-muted-foreground mt-1 text-xs">{meta.summary}</p>
                  <div className="text-muted-foreground mt-3 flex items-center gap-3 text-xs">
                    {latest ? (
                      <>
                        <span>v{latest.version}</span>
                        {latest.publishedAt && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="text-signal-green h-3 w-3" />
                            Published {formatDate(latest.publishedAt)}
                          </span>
                        )}
                        {latest.status === "DRAFT" && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="text-signal-orange h-3 w-3" />
                            Draft
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground/60">Not yet created</span>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
