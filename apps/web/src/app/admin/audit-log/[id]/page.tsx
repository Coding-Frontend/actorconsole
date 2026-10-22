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

interface AuditEntry {
  id: string;
  action: string;
  resource: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  admin: { email: string; name: string | null } | null;
  actor: { email: string; name: string | null } | null;
}

export default async function AuditLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await api<AuditEntry>(`/admin/audit-log/${id}`);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <AdminDetailError
        title="Audit entry unavailable"
        message={res.error.message}
        backHref="/admin/audit-log"
        backLabel="Back to audit log"
      />
    );
  }
  const entry = res.data;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/audit-log">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All audit entries
          </Link>
        </Button>
      </div>

      <PageHeader title="Audit entry" description={relativeTime(entry.createdAt)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Action" value={<Badge variant="outline">{entry.action}</Badge>} />
            <Row
              label="Resource"
              value={<span className="font-mono text-xs">{entry.resource ?? "—"}</span>}
            />
            <Row label="Admin" value={entry.admin?.name ?? entry.admin?.email ?? "System"} />
            <Row label="Target user" value={entry.actor?.email ?? "—"} />
            <Row label="IP" value={<span className="font-mono text-xs">{entry.ip ?? "—"}</span>} />
            <Row
              label="User agent"
              value={
                entry.userAgent ? <span className="text-xs italic">{entry.userAgent}</span> : "—"
              }
            />
            <Row label="Timestamp" value={formatDate(entry.createdAt, { withTime: true })} />
          </CardContent>
        </Card>
      </div>

      {entry.before && Object.keys(entry.before).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Before state</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted max-h-[400px] overflow-auto whitespace-pre-wrap rounded-lg p-4 font-mono text-xs leading-relaxed">
              {JSON.stringify(entry.before, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {entry.after && Object.keys(entry.after).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">After state</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted max-h-[400px] overflow-auto whitespace-pre-wrap rounded-lg p-4 font-mono text-xs leading-relaxed">
              {JSON.stringify(entry.after, null, 2)}
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
