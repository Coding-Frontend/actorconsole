import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { api } from "@/lib/admin/server-api";
import { relativeTime } from "@/lib/utils";
import Link from "next/link";
import { AdminApiError, AdminPagination } from "@/components/admin/admin-pagination";
import { AdminRegistryFilters } from "@/components/admin/admin-registry-filters";

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100, 200].includes(requestedLimit) ? requestedLimit : 50;
  const res = await api<any>("/admin/errors", {
    params: {
      search: params.q || undefined,
      source: params.source || undefined,
      severity: params.severity || undefined,
      sort: params.sort || undefined,
      order: params.order || undefined,
      page,
      limit,
    },
  });
  if (!res.ok)
    return (
      <div className="space-y-6">
        <PageHeader title="Errors" description="Application failures" />
        <AdminApiError message={res.error.message} />
      </div>
    );
  const data = res.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Errors" description={`${data.total} logged`} />

      <Card className="overflow-hidden">
        <AdminRegistryFilters
          path="/admin/errors"
          params={params}
          searchPlaceholder="Message, stack, or fingerprint"
          filters={[
            {
              name: "source",
              label: "Sources",
              options: ["web", "api", "worker", "mcp"].map((value) => ({
                value,
                label: value.toUpperCase(),
              })),
            },
            {
              name: "severity",
              label: "Severities",
              options: ["debug", "info", "warn", "error", "fatal"].map((value) => ({
                value,
                label: value,
              })),
            },
          ]}
          sorts={[
            { value: "createdAt", label: "Newest" },
            { value: "source", label: "Source" },
            { value: "severity", label: "Severity" },
            { value: "fingerprint", label: "Fingerprint" },
          ]}
          defaultSort="createdAt"
          pageSizes={[25, 50, 100, 200]}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Fingerprint</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground text-xs">
                  <Link href={`/admin/errors/${e.id}`} className="hover:text-signal-orange">
                    {relativeTime(e.createdAt)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{e.source}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      e.severity === "fatal"
                        ? "destructive"
                        : e.severity === "warn"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {e.severity}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-md">
                  <p className="line-clamp-1 text-sm">{e.message}</p>
                  {e.context ? (
                    <pre className="text-muted-foreground mt-1 line-clamp-1 text-[10px]">
                      {JSON.stringify(e.context).slice(0, 120)}
                    </pre>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs">{e.fingerprint ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/errors/${e.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-12 text-center text-sm">
                  No errors found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <AdminPagination
        path="/admin/errors"
        page={page}
        total={data.total}
        limit={limit}
        query={{ ...params, page: undefined, limit: String(limit) }}
      />
    </div>
  );
}
