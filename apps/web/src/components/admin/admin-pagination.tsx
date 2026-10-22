import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdminPagination({
  path,
  page,
  total,
  limit,
  query = {},
}: {
  path: string;
  page: number;
  total: number;
  limit: number;
  query?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    params.set("page", String(target));
    return `${path}?${params.toString()}`;
  };
  if (page > totalPages) redirect(href(totalPages));
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">Page {Math.min(page, totalPages)} of {totalPages} · {total} records</span>
      <div className="flex gap-2">
        {page > 1 ? <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}>Previous</Link></Button> : <Button variant="outline" size="sm" disabled>Previous</Button>}
        {page < totalPages ? <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Next</Link></Button> : <Button variant="outline" size="sm" disabled>Next</Button>}
      </div>
    </nav>
  );
}

export function AdminApiError({ message }: { message: string }) {
  return <div role="alert" className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-4 text-sm">The admin API could not load this view: {message}</div>;
}

export function AdminDetailError({
  title,
  message,
  backHref,
  backLabel,
}: {
  title: string;
  message: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          This record could not be loaded from the control plane.
        </p>
      </div>
      <AdminApiError message={message} />
    </div>
  );
}
