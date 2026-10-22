import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { AdminDetailError } from "@/components/admin/admin-pagination";
import { api } from "@/lib/admin/server-api";
import { ArrowLeft } from "lucide-react";
import { formatDate, relativeTime } from "@/lib/utils";

interface AppError {
  id: string;
  source: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  severity: string;
  fingerprint: string | null;
  createdAt: string;
}

export default async function ErrorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await api<AppError>(`/admin/errors/${id}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <AdminDetailError
        title="Error record unavailable"
        message={res.error.message}
        backHref="/admin/errors"
        backLabel="Back to errors"
      />
    );
  }
  const err = res.data;

  const severityColors: Record<string, string> = {
    fatal: "destructive",
    error: "destructive",
    warn: "warning",
    info: "secondary",
    debug: "outline",
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/errors">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All errors
          </Link>
        </Button>
      </div>

      <PageHeader title="Error detail" description={relativeTime(err.createdAt)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Source" value={<Badge variant="outline">{err.source}</Badge>} />
            <Row
              label="Severity"
              value={
                <Badge variant={(severityColors[err.severity] ?? "secondary") as any}>
                  {err.severity}
                </Badge>
              }
            />
            <Row
              label="Fingerprint"
              value={<span className="font-mono text-xs">{err.fingerprint ?? "—"}</span>}
            />
            <Row label="Timestamp" value={formatDate(err.createdAt, { withTime: true })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted whitespace-pre-wrap rounded-lg p-3 text-sm">{err.message}</pre>
          </CardContent>
        </Card>
      </div>

      {err.stack && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stack trace</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted max-h-[400px] overflow-auto whitespace-pre-wrap rounded-lg p-4 font-mono text-xs leading-relaxed">
              {err.stack}
            </pre>
          </CardContent>
        </Card>
      )}

      {err.context && Object.keys(err.context).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Context</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted max-h-[400px] overflow-auto whitespace-pre-wrap rounded-lg p-4 font-mono text-xs leading-relaxed">
              {JSON.stringify(err.context, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-border/40 flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
