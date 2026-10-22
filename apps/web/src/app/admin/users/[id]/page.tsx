import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader } from "@/components/admin/page-header";
import { UserActions } from "@/components/admin/user-actions";
import { api } from "@/lib/admin/server-api";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  Bot,
  Building2,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  KeyRound,
  LifeBuoy,
  ShieldCheck,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { AdminDetailError } from "@/components/admin/admin-pagination";

function initials(name: string | null | undefined, email: string) {
  return (name ?? email)
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const operator = session?.user ?? null;
  const response = await api<any>(`/admin/users/${id}`);
  if (!response.ok) {
    if (response.status === 404) notFound();
    return (
      <AdminDetailError
        title="User account unavailable"
        message={response.error.message}
        backHref="/admin/users"
        backLabel="Back to user directory"
      />
    );
  }
  const user = response.data;

  const stats = [
    { label: "Actors", value: user._count?.actors ?? 0, icon: Bot },
    {
      label: "Publishing schedules",
      value: user._count?.bulkPublishSchedules ?? 0,
      icon: Calendar,
    },
    {
      label: "Subscriptions",
      value: user._count?.subscriptions ?? 0,
      icon: CircleDollarSign,
    },
    { label: "Workspaces", value: user.businessProfiles?.length ?? 0, icon: CircleDollarSign },
    { label: "Apify tokens", value: user._count?.apifyTokens ?? 0, icon: KeyRound },
    { label: "Support tickets", value: user._count?.tickets ?? 0, icon: LifeBuoy },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="User dossier"
        description="Identity, portfolio footprint, access state, and operator controls."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/users">
              <ArrowLeft className="h-4 w-4" /> User directory
            </Link>
          </Button>
        }
      />

      <Card className="relative overflow-hidden shadow-sm">
        <div className="bg-signal-orange absolute inset-y-0 left-0 w-1" />
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-6">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="border-border h-14 w-14 shrink-0 border sm:h-16 sm:w-16">
              {user.image ? <AvatarImage src={user.image} alt="" /> : null}
              <AvatarFallback className="font-display-tight text-lg">
                {initials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="data-stamp text-signal-orange uppercase tracking-[0.08em]">
                  Account record
                </span>
                <span className="text-muted-foreground font-mono text-[10px]">
                  / {user.id.slice(0, 10)}
                </span>
              </div>
              <h1 className="font-display-tight truncate text-[27px] leading-none sm:text-[32px]">
                {user.name ?? "Unnamed account"}
              </h1>
              <p className="text-muted-foreground mt-1.5 truncate text-sm">{user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant="outline">{user.businessProfiles?.length ?? 0} workspaces</Badge>
            <Badge variant="outline">
              <ShieldCheck className="h-3 w-3" /> {user.role.replace("_", " ")}
            </Badge>
            {user.suspendedAt ? (
              <Badge variant="destructive">Suspended</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            )}
          </div>
        </div>

        <div className="border-border/80 grid border-t sm:grid-cols-4 xl:grid-cols-7">
          {stats.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="border-border/80 hover:bg-accent/45 group border-b border-r px-4 py-3.5 last:border-r-0 xl:border-b-0 xl:[&:last-child]:border-r-0 sm:[&:nth-child(4n)]:border-r-0 xl:[&:nth-child(4n)]:border-r"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-muted-foreground truncate text-[10px]">{label}</p>
                <Icon className="text-signal-blue h-3 w-3 shrink-0" />
              </div>
              <p className="font-display-tight text-xl tabular-nums">{value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="border-border/80 border-b px-5 py-4 sm:px-6">
          <p className="type-kicker text-signal-blue">User workspaces</p>
          <h2 className="font-display-tight mt-1 text-[22px]">Workspaces</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Open a workspace to inspect its Actors, schedules, notifications, and account tools.
          </p>
        </div>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
          {user.businessProfiles?.map(
            (workspace: {
              id: string;
              name: string;
              slug: string;
              plan: string;
              isDefault: boolean;
              _count?: { actors: number; bulkPublishSchedules: number; notifications: number };
            }) => (
              <Link
                key={workspace.id}
                href={`/admin/users/${user.id}/workspaces/${workspace.id}`}
                className="border-border hover:border-signal-blue focus-visible:ring-ring rounded-md border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <Building2 className="text-signal-blue h-4 w-4 shrink-0" />
                    <span className="truncate">{workspace.name}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{workspace.plan}</Badge>
                  {workspace.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  {workspace._count?.actors ?? 0} Actors ·{" "}
                  {workspace._count?.bulkPublishSchedules ?? 0} schedules ·{" "}
                  {workspace._count?.notifications ?? 0} notifications
                </p>
              </Link>
            ),
          )}
          {!user.businessProfiles?.length ? (
            <p className="text-muted-foreground text-sm">This user has no workspaces yet.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <div className="border-border/80 border-b px-5 py-4 sm:px-6">
            <p className="type-kicker text-signal-blue">Identity and access</p>
            <h2 className="font-display-tight mt-1 text-[22px]">Account record</h2>
          </div>
          <CardContent className="p-0 sm:p-0">
            <dl className="divide-border/70 divide-y">
              <RecordRow
                label="Account ID"
                value={<code className="break-all font-mono text-[11px]">{user.id}</code>}
              />
              <RecordRow label="Display name" value={user.name ?? "Not provided"} />
              <RecordRow label="Email address" value={user.email} />
              <RecordRow
                label="Role"
                value={<Badge variant="outline">{user.role.replace("_", " ")}</Badge>}
              />
              <RecordRow
                label="Account status"
                value={
                  user.suspendedAt ? (
                    <span className="text-destructive inline-flex items-center gap-1.5 text-xs font-medium">
                      <span className="bg-destructive h-1.5 w-1.5 rounded-full" /> Suspended
                    </span>
                  ) : (
                    <span className="text-signal-green inline-flex items-center gap-1.5 text-xs font-medium">
                      <span className="bg-signal-green h-1.5 w-1.5 rounded-full" /> Active
                    </span>
                  )
                }
              />
              <RecordRow label="Joined" value={formatDate(user.createdAt, { withTime: true })} />
              <RecordRow
                label="Email verified"
                value={
                  user.emailVerified ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="text-signal-green h-3.5 w-3.5" />
                      {formatDate(user.emailVerified, { withTime: true })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not verified</span>
                  )
                }
              />
            </dl>
          </CardContent>
        </Card>

        <aside aria-label="User controls">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="type-kicker text-signal-orange">Operator controls</p>
            <span className="text-muted-foreground font-mono text-[9px] uppercase tracking-[0.08em]">
              Audited actions
            </span>
          </div>
          <UserActions user={user} canUseSuperAdminActions={operator?.role === "SUPER_ADMIN"} />
        </aside>
      </div>
    </div>
  );
}

function RecordRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[170px_minmax(0,1fr)] sm:items-center sm:gap-5 sm:px-6">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 text-sm font-medium sm:text-right">{value}</dd>
    </div>
  );
}
