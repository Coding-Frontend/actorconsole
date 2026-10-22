import Link from "next/link";
import { redirect } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/lib/admin/server-api";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Filter,
  Search,
  Users,
} from "lucide-react";
import { AdminApiError } from "@/components/admin/admin-pagination";

interface SearchParams {
  q?: string;
  plan?: string;
  role?: string;
  suspended?: string;
  sort?: string;
  order?: string;
  limit?: string;
  page?: string;
}

function initials(name: string | null | undefined, email: string) {
  return (name ?? email)
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function usersHref(params: SearchParams, page: number) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.plan) search.set("plan", params.plan);
  if (params.role) search.set("role", params.role);
  if (params.suspended) search.set("suspended", params.suspended);
  if (params.sort) search.set("sort", params.sort);
  if (params.order) search.set("order", params.order);
  if (params.limit) search.set("limit", params.limit);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedLimit = Number(params.limit ?? 50);
  const limit = [25, 50, 100].includes(requestedLimit) ? requestedLimit : 50;
  const response = await api<any>("/admin/users", {
    params: {
      search: params.q || undefined,
      plan: params.plan || undefined,
      role: params.role || undefined,
      suspended: params.suspended || undefined,
      sort: params.sort || undefined,
      order: params.order || undefined,
      page,
      limit,
    },
  });
  if (!response.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="User directory" description="Manage platform accounts and access." />
        <AdminApiError message={response.error.message ?? "Failed to load users"} />
      </div>
    );
  }
  const data = response.data;
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  if (page > totalPages) redirect(usersHref(params, totalPages));
  const hasFilters = Boolean(
    params.q ||
    params.plan ||
    params.role ||
    params.suspended ||
    params.sort ||
    params.order ||
    params.limit,
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="User directory"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{data.total.toLocaleString("en-IN")} accounts in the control plane.</span>
            {hasFilters ? (
              <span className="text-signal-orange font-mono text-[10px] uppercase tracking-[0.08em]">
                Filtered view
              </span>
            ) : null}
          </span>
        }
      />

      <Card className="overflow-hidden shadow-sm">
        <form
          className="border-border/80 grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_150px_150px_150px_180px_110px_100px_auto_auto] xl:items-center"
          method="get"
        >
          <div className="relative min-w-0">
            <label htmlFor="user-search" className="sr-only">
              Search users
            </label>
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              id="user-search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Name, email, or account ID"
              className="h-9 rounded-md pl-9"
            />
          </div>
          <label className="sr-only" htmlFor="plan-filter">
            Filter by workspace plan
          </label>
          <select
            id="plan-filter"
            name="plan"
            defaultValue={params.plan ?? ""}
            className="border-input bg-card text-card-foreground hover:border-muted-foreground/50 focus-visible:border-ring focus-visible:ring-ring h-9 rounded-md border px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <option value="">Every workspace plan</option>
            <option value="FREE">Free</option>
            <option value="PRO">Pro</option>
          </select>
          <label className="sr-only" htmlFor="status-filter">
            Filter by status
          </label>
          <select
            id="status-filter"
            name="suspended"
            defaultValue={params.suspended ?? ""}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm shadow-sm"
          >
            <option value="">Every status</option>
            <option value="false">Active</option>
            <option value="true">Suspended</option>
          </select>
          <label className="sr-only" htmlFor="user-sort">
            Sort accounts
          </label>
          <select
            id="user-sort"
            name="sort"
            defaultValue={params.sort ?? "createdAt"}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm shadow-sm"
          >
            <option value="createdAt">Joined</option>
            <option value="updatedAt">Recently updated</option>
            <option value="email">Email</option>
            <option value="name">Name</option>
            <option value="role">Role</option>
          </select>
          <label className="sr-only" htmlFor="user-order">
            Sort direction
          </label>
          <select
            id="user-order"
            name="order"
            defaultValue={params.order ?? "desc"}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm shadow-sm"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <label className="sr-only" htmlFor="user-limit">
            Rows per page
          </label>
          <select
            id="user-limit"
            name="limit"
            defaultValue={String(limit)}
            className="border-input bg-card h-9 rounded-md border px-3 text-sm shadow-sm"
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
          </select>
          <label className="sr-only" htmlFor="role-filter">
            Filter by role
          </label>
          <select
            id="role-filter"
            name="role"
            defaultValue={params.role ?? ""}
            className="border-input bg-card text-card-foreground hover:border-muted-foreground/50 focus-visible:border-ring focus-visible:ring-ring h-9 rounded-md border px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <option value="">Every role</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            <Filter className="h-4 w-4" /> Apply
          </Button>
          {hasFilters ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/users">Clear</Link>
            </Button>
          ) : (
            <span />
          )}
        </form>

        <div className="border-border/80 bg-muted/35 flex items-center justify-between border-b px-4 py-2.5 sm:px-5">
          <span className="inline-flex items-center gap-2 text-xs font-medium">
            <Users className="text-signal-blue h-3.5 w-3.5" /> Account register
          </span>
          <span className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.08em]">
            Page {Math.min(page, totalPages)} / {totalPages}
          </span>
        </div>

        {response.ok ? (
          <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Workspace plans</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Footprint</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((user: any) => (
                <TableRow key={user.id} className="group">
                  <TableCell>
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="focus-visible:ring-ring inline-flex max-w-[320px] items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2"
                    >
                      <Avatar className="border-border h-8 w-8 border">
                        {user.image ? <AvatarImage src={user.image} alt="" /> : null}
                        <AvatarFallback className="font-mono text-[10px]">
                          {initials(user.name, user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="group-hover:text-signal-orange block truncate text-sm font-semibold transition-colors">
                          {user.name ?? "Unnamed account"}
                        </span>
                        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <span className="truncate">{user.email}</span>
                          {user.emailVerified ? (
                            <span className="shrink-0" title="Email verified">
                              <CheckCircle2
                                className="text-signal-green h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span className="sr-only">Email verified</span>
                            </span>
                          ) : (
                            <span className="sr-only">Email not verified</span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {user.businessProfiles?.map((workspace: any) => (
                        <Badge
                          key={workspace.id}
                          variant={workspace.plan === "FREE" ? "secondary" : "outline"}
                        >
                          {workspace.name}: {workspace.plan}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        user.role === "SUPER_ADMIN"
                          ? "border-signal-orange/40 bg-signal-orange/10 text-signal-orange"
                          : ""
                      }
                    >
                      {user.role.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.suspendedAt ? (
                      <span className="text-destructive inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className="bg-destructive h-1.5 w-1.5 rounded-full" /> Suspended
                      </span>
                    ) : (
                      <span className="text-signal-green inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className="bg-signal-green h-1.5 w-1.5 rounded-full" /> Active
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-[10px] tabular-nums">
                      {user._count?.actors ?? 0} actors · {user._count?.bulkPublishSchedules ?? 0}{" "}
                      publishing schedules
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-[10px]">
                    {user.createdAt ? formatDate(user.createdAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                      <Link
                        href={`/admin/users/${user.id}`}
                        aria-label={`Open ${user.name ?? user.email}`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center">
                    <Search className="text-muted-foreground mx-auto h-5 w-5" />
                    <p className="mt-3 text-sm font-semibold">No matching accounts</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Adjust the search terms or clear the active filters.
                    </p>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        ) : (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold">User directory unavailable</p>
            <p className="text-muted-foreground mt-1 text-xs">
              The admin API did not return a usable response.
            </p>
          </div>
        )}

        <div className="border-border/80 bg-muted/20 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-muted-foreground text-xs">
            Showing {data.items.length.toLocaleString("en-IN")} of{" "}
            {data.total.toLocaleString("en-IN")} accounts
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={usersHref(params, page - 1)}>
                  <ArrowLeft className="h-4 w-4" /> Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ArrowLeft className="h-4 w-4" /> Previous
              </Button>
            )}
            {page < totalPages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={usersHref(params, page + 1)}>
                  Next <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
