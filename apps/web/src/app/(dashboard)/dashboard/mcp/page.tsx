"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Copy,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Trash2,
  UsersRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-base";
import { ConfirmDialog } from "@/components/ui/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ItemsPerPageSelect } from "@/components/ui/items-per-page";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";
import { DEFAULT_PAGE_SIZE } from "@/lib/page-size";
import {
  DashboardAsyncState,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-workbench";

type WorkspacePlan = "FREE" | "PRO";

interface Credential {
  id: string;
  name: string;
  keyPreview: string;
  scopes: string[];
  permissions: McpPermission[];
  actorIds: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  rotatedAt: string | null;
  createdAt: string;
}

const MCP_PERMISSIONS = [
  ["workspace:read", "View workspace"],
  ["actors:read", "View actors"],
  ["actors:sync", "Sync actors"],
  ["actors:optimize", "Generate actor changes"],
  ["actors:write", "Apply actor changes"],
  ["notifications:read", "View notifications"],
  ["notifications:write", "Update notifications"],
  ["usage:read", "View usage and revenue"],
  ["pricing:read", "View pricing"],
  ["pricing:write", "Update pricing"],
  ["publishing:read", "View publishing queues"],
  ["publishing:write", "Manage publishing queues"],
  ["publishing:run", "Run publishing queues"],
] as const;
type McpPermission = (typeof MCP_PERMISSIONS)[number][0];
const ALL_MCP_PERMISSIONS = MCP_PERMISSIONS.map(([value]) => value);
const MAX_SCOPED_ACTORS = 100;

async function fetchWorkspaceActors(): Promise<ActorOption[]> {
  const actors: ActorOption[] = [];
  let page = 1;
  let total = 0;
  do {
    const response = await fetch(`${API_BASE_URL}/account/api-key-actors?limit=500&page=${page}`, {
      cache: "no-store",
      credentials: "include",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || !Array.isArray(body.data?.items)) {
      throw new Error(body?.error?.message ?? "Could not load Actors for credential scope");
    }
    actors.push(...body.data.items);
    total = body.data.total;
    if (body.data.items.length === 0 && actors.length < total) {
      throw new Error("Actor list ended before all Actors were loaded");
    }
    page += 1;
  } while (actors.length < total);
  return actors;
}
const READ_MCP_PERMISSIONS: McpPermission[] = [
  "workspace:read",
  "actors:read",
  "notifications:read",
  "usage:read",
  "pricing:read",
  "publishing:read",
];
const OPERATE_MCP_PERMISSIONS: McpPermission[] = [
  ...READ_MCP_PERMISSIONS,
  "actors:sync",
  "actors:optimize",
  "publishing:run",
];
type PermissionPreset = "read" | "operate" | "full" | "custom";
const permissionPresets: Array<{
  id: PermissionPreset;
  label: string;
  description: string;
  permissions: McpPermission[];
}> = [
  {
    id: "read",
    label: "Read only",
    description: "Inspect workspace, Actors, usage, pricing, and queues.",
    permissions: READ_MCP_PERMISSIONS,
  },
  {
    id: "operate",
    label: "Operate",
    description: "Read, sync, draft improvements, and run existing queues.",
    permissions: OPERATE_MCP_PERMISSIONS,
  },
  {
    id: "full",
    label: "Full access",
    description: "Includes Actor, pricing, notification, and publishing writes.",
    permissions: ALL_MCP_PERMISSIONS,
  },
];

function matchingPreset(permissions: McpPermission[]): PermissionPreset {
  const selected = new Set(permissions);
  return (
    permissionPresets.find(
      ({ permissions: option }) =>
        option.length === selected.size && option.every((item) => selected.has(item)),
    )?.id ?? "custom"
  );
}

interface McpInfo {
  transport: string;
  tools: string[];
}

interface ActorOption {
  apifyActorId: string;
  title: string | null;
  actorName: string;
  username: string;
}

interface OneTimeSecret {
  value: string;
  credentialName: string;
  reason: "created" | "rotated";
}

interface ConfirmAction {
  type: "rotate" | "revoke";
  credential: Credential;
}

const dayInMs = 86_400_000;
function formatDate(value: string | null, fallback = "Never") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null, fallback = "Never used") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function credentialStatus(credential: Credential) {
  if (credential.revokedAt) return "revoked" as const;
  if (credential.expiresAt && new Date(credential.expiresAt).getTime() <= Date.now()) {
    return "expired" as const;
  }
  return "active" as const;
}

function actorLabel(actor: ActorOption) {
  return actor.title?.trim() || `${actor.username}/${actor.actorName}`;
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-label="Loading MCP access">
      <div className="border-border/80 flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-full max-w-xl sm:w-[36rem]" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-[28rem] w-full" />
    </div>
  );
}

export default function McpPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [info, setInfo] = useState<McpInfo | null>(null);
  const [actors, setActors] = useState<ActorOption[]>([]);
  const [actorLoadState, setActorLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [activeCredentialCount, setActiveCredentialCount] = useState(0);
  const [workspacePlan, setWorkspacePlan] = useState<WorkspacePlan>("FREE");
  const [mcpAvailable, setMcpAvailable] = useState(false);
  const [workspaceRestricted, setWorkspaceRestricted] = useState(false);
  const [name, setName] = useState("MCP client");
  const [expiryDays, setExpiryDays] = useState("90");
  const [actorScope, setActorScope] = useState<"all" | "selected">("all");
  const [selectedActorIds, setSelectedActorIds] = useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<McpPermission[]>([
    ...READ_MCP_PERMISSIONS,
  ]);
  const [permissionPreset, setPermissionPreset] = useState<PermissionPreset>("read");
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [secret, setSecret] = useState<OneTimeSecret | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();

  const refreshActorOptions = useCallback(async () => {
    setActorLoadState("loading");
    try {
      setActors(await fetchWorkspaceActors());
      setActorLoadState("ready");
    } catch {
      setActorLoadState("error");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Credentials and workspace access are the critical panel. Actor
      // restrictions and MCP capability metadata are independent enrichment;
      // they must not delay the first useful view of this page.
      const [credentialsResponse, statusResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/account/api-keys?page=${page}&limit=${pageSize}`, {
          cache: "no-store",
          credentials: "include",
        }),
        fetch(`${API_BASE_URL}/actors/plan-usage`, {
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      const [credentialsBody, statusBody] = await Promise.all([
        credentialsResponse.json().catch(() => null),
        statusResponse.json().catch(() => null),
      ]);

      if (!credentialsResponse.ok || !credentialsBody?.ok) {
        throw new Error(credentialsBody?.error?.message ?? "Could not load MCP credentials");
      }
      if (!statusResponse.ok || !statusBody?.ok) {
        throw new Error(statusBody?.error?.message ?? "Could not load workspace access");
      }
      const credentialData = Array.isArray(credentialsBody.data)
        ? {
            items: credentialsBody.data,
            total: credentialsBody.data.length,
            page,
            limit: pageSize,
            activeCount: credentialsBody.data.filter(
              (credential: Credential) => credentialStatus(credential) === "active",
            ).length,
          }
        : (credentialsBody.data ?? {
            items: [],
            total: 0,
            page,
            limit: pageSize,
            activeCount: 0,
          });
      setCredentials(credentialData.items ?? []);
      setTotal(credentialData.total ?? 0);
      setPage(credentialData.page ?? page);
      setPageSize(credentialData.limit ?? pageSize);
      setActiveCredentialCount(credentialData.activeCount ?? 0);
      if (["FREE", "PRO"].includes(statusBody.data?.plan)) {
        setWorkspacePlan(statusBody.data.plan);
      }
      setMcpAvailable(true);
      setWorkspaceRestricted(statusBody.data?.upgradeRequired === true);

      void fetch(`${API_BASE_URL}/mcp/info`, { cache: "no-store", credentials: "include" })
        .then(async (response) => {
          const body = await response.json().catch(() => null);
          if (response.ok && body?.ok) setInfo(body.data);
          else if (body?.error?.code === "plan_usage_limit_exceeded") setMcpAvailable(false);
        })
        .catch(() => undefined);
      // Actor restrictions are optional. Credential management remains usable
      // while an actor sync is unavailable or slow.
      void refreshActorOptions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load MCP access");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, refreshActorOptions]);

  useEffect(() => void load(), [load]);

  const actorById = useMemo(
    () => new Map(actors.map((actor) => [actor.apifyActorId, actor])),
    [actors],
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggleActor(actorId: string) {
    setSelectedActorIds((current) =>
      current.includes(actorId)
        ? current.filter((selectedId) => selectedId !== actorId)
        : current.length < MAX_SCOPED_ACTORS
          ? [...current, actorId]
          : current,
    );
  }

  function openCreateDialog() {
    setEditingCredential(null);
    setName("MCP client");
    setExpiryDays("90");
    setActorScope("all");
    setSelectedActorIds([]);
    setSelectedPermissions([...READ_MCP_PERMISSIONS]);
    setPermissionPreset("read");
    setCredentialDialogOpen(true);
  }

  function openEditDialog(credential: Credential) {
    setEditingCredential(credential);
    setName(credential.name);
    setExpiryDays(credential.expiresAt ? "keep" : "");
    setActorScope(credential.actorIds.length > 0 ? "selected" : "all");
    setSelectedActorIds(credential.actorIds);
    const permissions =
      credential.permissions?.length > 0 ? credential.permissions : [...ALL_MCP_PERMISSIONS];
    setSelectedPermissions(permissions);
    setPermissionPreset(matchingPreset(permissions));
    setCredentialDialogOpen(true);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      toast.success(`${label} copied`);
      window.setTimeout(
        () => setCopiedValue((current) => (current === value ? null : current)),
        1800,
      );
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  }

  function saveCredential() {
    if (!name.trim() || !mcpAvailable || creating) return;
    if (actorScope === "selected" && actorLoadState !== "ready") {
      toast.error("Load the Actor list before saving a restricted credential");
      return;
    }
    if (actorScope === "selected" && selectedActorIds.length === 0) {
      toast.error("Select at least one actor or allow all workspace actors");
      return;
    }
    if (selectedPermissions.length === 0) {
      toast.error("Select at least one MCP permission");
      return;
    }

    startCreating(async () => {
      try {
        const isEditing = Boolean(editingCredential);
        const endpoint = isEditing
          ? `${API_BASE_URL}/account/api-keys/${encodeURIComponent(editingCredential!.id)}`
          : `${API_BASE_URL}/account/api-keys`;
        const requestBody: Record<string, unknown> = {
          name: name.trim(),
          actorIds: actorScope === "selected" ? selectedActorIds : [],
          permissions: selectedPermissions,
        };
        if (expiryDays !== "keep") {
          requestBody.expiresAt = expiryDays
            ? new Date(Date.now() + Number(expiryDays) * dayInMs).toISOString()
            : null;
        }
        const response = await fetch(endpoint, {
          method: isEditing ? "PATCH" : "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const responseBody = await response.json().catch(() => null);
        if (!response.ok || !responseBody?.ok) {
          throw new Error(
            responseBody?.error?.message ??
              `Could not ${isEditing ? "update" : "create"} MCP credential`,
          );
        }

        if (isEditing) {
          setCredentials((current) =>
            current.map((item) =>
              item.id === editingCredential!.id
                ? {
                    ...item,
                    ...responseBody.data,
                    actorIds: responseBody.data.actorIds ?? [],
                    permissions: responseBody.data.permissions ?? selectedPermissions,
                    expiresAt: responseBody.data.expiresAt ?? null,
                  }
                : item,
            ),
          );
          setCredentialDialogOpen(false);
          window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
          toast.success("MCP credential updated");
          return;
        }

        const nextCredential: Credential = {
          ...responseBody.data,
          scopes: responseBody.data.scopes ?? ["mcp", ...selectedPermissions],
          permissions: responseBody.data.permissions ?? selectedPermissions,
          actorIds: responseBody.data.actorIds ?? [],
          lastUsedAt: responseBody.data.lastUsedAt ?? null,
          expiresAt: responseBody.data.expiresAt ?? null,
          revokedAt: responseBody.data.revokedAt ?? null,
          rotatedAt: responseBody.data.rotatedAt ?? null,
        };
        setCredentials((current) => [nextCredential, ...current]);
        setTotal((current) => current + 1);
        setActiveCredentialCount((current) => current + 1);
        setSecret({
          value: responseBody.data.key,
          credentialName: nextCredential.name,
          reason: "created",
        });
        setName("MCP client");
        setActorScope("all");
        setSelectedActorIds([]);
        setSelectedPermissions([...READ_MCP_PERMISSIONS]);
        setPermissionPreset("read");
        setCredentialDialogOpen(false);
        window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
        toast.success("MCP credential created");
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : `Could not ${editingCredential ? "update" : "create"} MCP credential`,
        );
      }
    });
  }

  async function rotateCredential(credential: Credential) {
    const response = await fetch(
      `${API_BASE_URL}/account/api-keys/${encodeURIComponent(credential.id)}/rotate`,
      { method: "POST", credentials: "include" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error?.message ?? "Could not rotate MCP credential");
    }

    setCredentials((current) =>
      current.map((item) => (item.id === credential.id ? { ...item, ...body.data } : item)),
    );
    setSecret({
      value: body.data.key,
      credentialName: credential.name,
      reason: "rotated",
    });
    window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
    toast.success("Credential rotated; the previous secret no longer works");
  }

  async function revokeCredential(credential: Credential) {
    const response = await fetch(
      `${API_BASE_URL}/account/api-keys/${encodeURIComponent(credential.id)}`,
      { method: "DELETE", credentials: "include" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error?.message ?? "Could not revoke MCP credential");
    }

    const revokedAt = new Date().toISOString();
    setCredentials((current) =>
      current.map((item) => (item.id === credential.id ? { ...item, revokedAt } : item)),
    );
    if (credentialStatus(credential) === "active") {
      setActiveCredentialCount((current) => Math.max(0, current - 1));
    }
    window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
    toast.success("Credential revoked");
  }

  async function confirmCredentialAction() {
    if (!confirmAction) return;
    if (confirmAction.type === "rotate") {
      await rotateCredential(confirmAction.credential);
    } else {
      await revokeCredential(confirmAction.credential);
    }
  }

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <DashboardAsyncState
        status="error"
        title="MCP access could not be loaded"
        description={error}
        onRetry={() => void load()}
        className="max-w-3xl"
      />
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <DashboardPageHeader
        context="Workspace access"
        title="MCP access"
        description="Connect Codex, Claude Code, Cursor, or another MCP client. These credentials authenticate MCP access only."
        breadcrumbs={[{ label: "Developer" }, { label: "MCP access" }]}
        status={
          <Badge
            variant="outline"
            className={
              mcpAvailable
                ? "border-signal-green/40 bg-signal-green/5 text-signal-green"
                : "border-signal-orange/40 bg-signal-orange/5 text-signal-orange"
            }
          >
            {mcpAvailable ? (
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            ) : (
              <LockKeyhole className="mr-1 h-3.5 w-3.5" />
            )}
            {workspacePlan} workspace
          </Badge>
        }
        secondaryActions={[
          {
            label: "MCP documentation",
            href: "/docs/mcp-quickstart",
            icon: <BookOpen className="h-3.5 w-3.5" />,
          },
        ]}
        primaryAction={
          mcpAvailable ? (
            <Button variant="signal" size="sm" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5" /> Issue credential
            </Button>
          ) : (
            <Button variant="signal" size="sm" asChild>
              <Link href="/dashboard/billing">Upgrade to Pro</Link>
            </Button>
          )
        }
      />

      <nav
        className="border-border bg-card flex max-w-full items-center gap-1 overflow-x-auto rounded-sm border p-1"
        aria-label="MCP page sections"
      >
        <Button variant="secondary" size="sm" asChild>
          <a href="#credentials">Credentials</a>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href="#client-setup">Client setup</a>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href="#activity">Server overview</a>
        </Button>
      </nav>

      <section
        id="activity"
        className="workbench-panel scroll-mt-24 overflow-hidden"
        aria-label="MCP server overview"
      >
        <div className="grid sm:grid-cols-3">
          <StatusCell
            icon={ServerCog}
            label="Transport"
            value={mcpAvailable ? (info?.transport ?? "Unavailable") : "Plan locked"}
            detail="Configured server transport"
            tone="blue"
          />
          <StatusCell
            icon={Wrench}
            label="Registered tools"
            value={mcpAvailable ? String(info?.tools?.length ?? 0) : "—"}
            detail={mcpAvailable ? "Each credential may allow fewer" : "Pro required"}
            tone="orange"
          />
          <StatusCell
            icon={ShieldCheck}
            label="Active credentials"
            value={String(activeCredentialCount)}
            detail={total.toLocaleString() + " total in this workspace"}
            tone="green"
          />
        </div>
      </section>

      {workspaceRestricted ? (
        <p role="status" className="text-muted-foreground rounded-md border p-4 text-sm">
          MCP connection and credentials remain available. This workspace needs Pro to use actor,
          publishing, and reporting tools.{" "}
          <Link href="/dashboard/billing" className="text-signal-orange underline">
            Upgrade workspace
          </Link>
        </p>
      ) : null}
      {!mcpAvailable ? (
        <div className="border-signal-orange/30 bg-signal-orange/[0.04] flex flex-col gap-4 rounded-sm border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <LockKeyhole className="text-signal-orange mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">This workspace needs Pro to continue MCP access</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Free includes MCP for up to 50 actors and 500 monthly users. Upgrade when either
                limit is exceeded.
              </p>
            </div>
          </div>
          <Button variant="signal" asChild>
            <Link href="/dashboard/billing">
              View workspace plans <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ) : null}

      <Card id="credentials" className="min-w-0 scroll-mt-24">
        <CardHeader className="border-border/80 border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="text-signal-orange h-4 w-4" /> MCP credentials
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                Workspace-bound authentication for MCP clients.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="w-fit font-mono text-[10px] uppercase tracking-[0.08em]"
              >
                {activeCredentialCount} active
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {credentials.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <span className="bg-signal-blue/10 text-signal-blue flex h-11 w-11 items-center justify-center rounded-sm">
                <KeyRound className="h-5 w-5" />
              </span>
              <p className="mt-4 font-medium">No MCP credentials yet</p>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Issue a credential to authenticate your first coding client with this workspace.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm" aria-label="MCP credentials">
                <caption className="sr-only">MCP credentials for this workspace</caption>
                <thead className="bg-muted/30 text-muted-foreground border-border/60 border-b text-left text-xs">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Credential
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Access
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Last used
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Expires
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Created
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border/60 divide-y">
                  {credentials.map((credential) => (
                    <CredentialRow
                      key={credential.id}
                      credential={credential}
                      actorById={actorById}
                      onEdit={() => openEditDialog(credential)}
                      onRotate={() => setConfirmAction({ type: "rotate", credential })}
                      onRevoke={() => setConfirmAction({ type: "revoke", credential })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 0 ? (
            <nav
              className="border-border/80 flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              aria-label="MCP credential pagination"
            >
              <p className="text-muted-foreground text-xs">
                Showing{" "}
                <span className="text-foreground font-medium">
                  {((page - 1) * pageSize + 1).toLocaleString()}
                </span>
                –
                <span className="text-foreground font-medium">
                  {Math.min(page * pageSize, total).toLocaleString()}
                </span>{" "}
                of <span className="text-foreground font-medium">{total.toLocaleString()}</span>
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                <ItemsPerPageSelect
                  value={pageSize}
                  onChange={(nextPageSize) => {
                    setPage(1);
                    setPageSize(nextPageSize);
                  }}
                  label="Credentials per page"
                />
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    aria-label="Previous credentials page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-muted-foreground min-w-16 text-center text-xs tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                    aria-label="Next credentials page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </nav>
          ) : null}
        </CardContent>
      </Card>

      <Card id="client-setup" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ServerCog className="text-signal-blue h-4 w-4" /> Client setup
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Connect one client at a time and keep each credential independently revocable.
          </p>
        </CardHeader>
        <CardContent className="grid gap-px overflow-hidden rounded-sm border md:grid-cols-3">
          {[
            ["1", "Issue a credential", "Choose the minimum permissions and Actor access."],
            [
              "2",
              "Copy the secret once",
              "Store it in the selected MCP client's secure configuration.",
            ],
            [
              "3",
              "Verify the connection",
              "Open the client and confirm the workspace tools are available.",
            ],
          ].map(([step, title, description]) => (
            <div key={step} className="bg-card p-4">
              <p className="text-signal-orange font-mono text-[10px] font-semibold">STEP {step}</p>
              <p className="mt-2 text-sm font-semibold">{title}</p>
              <p className="text-muted-foreground mt-1 text-xs leading-5">{description}</p>
            </div>
          ))}
        </CardContent>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
          <Button size="sm" onClick={openCreateDialog} disabled={!mcpAvailable}>
            Issue credential
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/docs/mcp-quickstart">Open client setup guide</Link>
          </Button>
          <p className="text-muted-foreground w-full text-xs">
            After your first client request, check the credential’s Last used value above to confirm
            the connection.
          </p>
        </div>
      </Card>

      <Dialog
        open={credentialDialogOpen}
        onOpenChange={(open) => {
          if (!creating) setCredentialDialogOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <div className="bg-signal-blue/10 text-signal-blue mb-2 flex h-11 w-11 items-center justify-center rounded-sm">
              {editingCredential ? (
                <Pencil className="h-5 w-5" />
              ) : (
                <KeyRound className="h-5 w-5" />
              )}
            </div>
            <DialogTitle>
              {editingCredential ? "Edit MCP credential" : "Issue MCP credential"}
            </DialogTitle>
            <DialogDescription>
              {editingCredential
                ? "Update the client label, expiry, or actor access. The existing secret stays unchanged."
                : "Create one workspace-bound credential per MCP client. The secret will be shown once after creation."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              saveCredential();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="credential-name">Client name</Label>
              <Input
                id="credential-name"
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="Codex on work laptop"
                disabled={!mcpAvailable || creating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="credential-expiry">Expiry</Label>
              <select
                id="credential-expiry"
                value={expiryDays}
                onChange={(event) => setExpiryDays(event.target.value)}
                className="border-input bg-card focus-visible:ring-ring h-10 w-full rounded-sm border px-3 text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!mcpAvailable || creating}
              >
                {editingCredential?.expiresAt ? (
                  <option value="keep">
                    Keep current expiry · {formatDate(editingCredential.expiresAt)}
                  </option>
                ) : null}
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
                <option value="">No expiry</option>
              </select>
            </div>

            <fieldset className="space-y-2" disabled={!mcpAvailable || creating}>
              <legend className="text-sm font-medium">Access level</legend>
              <p className="text-muted-foreground text-xs">
                Choose the smallest access level your client needs.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {permissionPresets.map((preset) => (
                  <label
                    key={preset.id}
                    className={`cursor-pointer rounded-md border p-3 ${permissionPreset === preset.id ? "border-signal-orange bg-signal-orange/5" : "border-border"}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="radio"
                        name="mcp-access-level"
                        checked={permissionPreset === preset.id}
                        onChange={() => {
                          setPermissionPreset(preset.id);
                          setSelectedPermissions([...preset.permissions]);
                        }}
                      />
                      {preset.label}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs leading-5">
                      {preset.description}
                    </span>
                  </label>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPermissionPreset("custom")}
              >
                {permissionPreset === "custom"
                  ? "Custom permissions selected"
                  : "Customize individual permissions"}
              </Button>
            </fieldset>

            {permissionPreset === "custom" ? (
              <fieldset className="space-y-3" disabled={!mcpAvailable || creating}>
                <legend className="text-sm font-medium">Individual permissions</legend>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-xs">
                    Select only the operations this client needs.
                  </span>
                  <button
                    type="button"
                    className="text-signal-blue text-xs font-medium"
                    onClick={() =>
                      setSelectedPermissions(
                        selectedPermissions.length === ALL_MCP_PERMISSIONS.length
                          ? []
                          : [...ALL_MCP_PERMISSIONS],
                      )
                    }
                  >
                    {selectedPermissions.length === ALL_MCP_PERMISSIONS.length
                      ? "Clear all"
                      : "Select all"}
                  </button>
                </div>
                <div className="border-border grid gap-1 rounded-sm border p-2 sm:grid-cols-2">
                  {MCP_PERMISSIONS.map(([permission, label]) => (
                    <label
                      key={permission}
                      className="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(permission)}
                        onChange={() =>
                          setSelectedPermissions((current) =>
                            current.includes(permission)
                              ? current.filter((item) => item !== permission)
                              : [...current, permission],
                          )
                        }
                        className="accent-signal-orange h-4 w-4"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  Grant only the operations this client needs. Actor restrictions below are applied
                  in addition to these permissions.
                </p>
              </fieldset>
            ) : null}

            <fieldset className="space-y-3" disabled={!mcpAvailable || creating}>
              <legend className="text-sm font-medium">Actor access</legend>
              <div className="border-input bg-muted/30 grid grid-cols-2 rounded-sm border p-1">
                <button
                  type="button"
                  onClick={() => setActorScope("all")}
                  className={`rounded-sm px-3 py-2 text-xs font-medium transition-colors ${
                    actorScope === "all"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  All actors
                </button>
                <button
                  type="button"
                  onClick={() => setActorScope("selected")}
                  className={`rounded-sm px-3 py-2 text-xs font-medium transition-colors ${
                    actorScope === "selected"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  Selected only
                </button>
              </div>
              {actorScope === "selected" ? (
                actorLoadState === "loading" ? (
                  <div className="border-border text-muted-foreground rounded-sm border border-dashed p-3 text-xs">
                    Loading workspace Actors…
                  </div>
                ) : actorLoadState === "error" ? (
                  <div className="border-border rounded-sm border border-dashed p-3 text-xs">
                    <p>Could not load the workspace Actor list.</p>
                    <button
                      type="button"
                      className="text-signal-blue mt-2 font-medium"
                      onClick={() => void refreshActorOptions()}
                    >
                      Retry Actor list
                    </button>
                  </div>
                ) : actors.length === 0 ? (
                  <div className="border-border text-muted-foreground rounded-sm border border-dashed p-3 text-xs">
                    No actors are connected to this workspace yet.
                  </div>
                ) : (
                  <div className="border-border max-h-44 space-y-1 overflow-y-auto rounded-sm border p-1.5">
                    <p className="text-muted-foreground px-2 py-1 text-[11px]">
                      {selectedActorIds.length} of {MAX_SCOPED_ACTORS} allowed Actors selected
                    </p>
                    {actors.map((actor) => {
                      const selected = selectedActorIds.includes(actor.apifyActorId);
                      const inputId = `credential-actor-${actor.apifyActorId}`;
                      return (
                        <label
                          key={actor.apifyActorId}
                          htmlFor={inputId}
                          className="hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 rounded-sm px-2 py-2 transition-colors"
                        >
                          <span className="sr-only">Select actor</span>
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={selected}
                            disabled={!selected && selectedActorIds.length >= MAX_SCOPED_ACTORS}
                            onChange={() => toggleActor(actor.apifyActorId)}
                            className="accent-signal-orange mt-0.5 h-4 w-4 shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">
                              {actorLabel(actor)}
                            </span>
                            <span className="text-muted-foreground block truncate font-mono text-[10px]">
                              {actor.username}/{actor.actorName}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )
              ) : (
                <p className="text-muted-foreground text-xs">
                  Includes current and future actors in this workspace.
                </p>
              )}
            </fieldset>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCredentialDialogOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !mcpAvailable ||
                  creating ||
                  !name.trim() ||
                  selectedPermissions.length === 0 ||
                  (actorScope === "selected" &&
                    (actorLoadState !== "ready" || selectedActorIds.length === 0))
                }
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingCredential ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {creating
                  ? editingCredential
                    ? "Saving changes…"
                    : "Issuing credential…"
                  : editingCredential
                    ? "Save changes"
                    : "Issue MCP credential"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(secret)}
        onOpenChange={(open) => {
          if (!open) {
            setSecret(null);
            setCopiedValue(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="bg-signal-green/10 text-signal-green mb-2 flex h-11 w-11 items-center justify-center rounded-sm">
              <KeyRound className="h-5 w-5" />
            </div>
            <DialogTitle>
              Credential {secret?.reason === "rotated" ? "rotated" : "created"}
            </DialogTitle>
            <DialogDescription>
              Copy the new secret for{" "}
              <span className="text-foreground font-medium">{secret?.credentialName}</span> now. For
              safety, it will not be shown again after this dialog closes.
            </DialogDescription>
          </DialogHeader>
          <div className="border-signal-green/30 bg-signal-green/[0.04] rounded-sm border p-3">
            <p className="data-stamp text-signal-green mb-2 uppercase tracking-[0.08em]">
              One-time secret
            </p>
            <code className="bg-card block max-h-28 overflow-auto break-all rounded-sm border p-3 text-xs leading-relaxed">
              {secret?.value}
            </code>
          </div>
          {secret?.reason === "rotated" ? (
            <p className="text-muted-foreground flex items-start gap-2 text-xs">
              <CircleSlash2 className="text-signal-orange mt-0.5 h-3.5 w-3.5 shrink-0" />
              The previous secret stopped working immediately. Update every client that used it.
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSecret(null);
                setCopiedValue(null);
              }}
            >
              Close
            </Button>
            <Button
              onClick={() => secret && void copyText(secret.value, "Credential")}
              disabled={!secret}
            >
              {secret && copiedValue === secret.value ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {secret && copiedValue === secret.value ? "Copied" : "Copy secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction?.type === "rotate" ? "Rotate MCP credential?" : "Revoke MCP credential?"
        }
        description={
          confirmAction?.type === "rotate"
            ? `The current secret for ${confirmAction.credential.name} will stop working immediately. You will receive a replacement secret once.`
            : `This permanently disables ${confirmAction?.credential.name ?? "this credential"}. Connected clients using it will lose MCP access immediately.`
        }
        confirmLabel={confirmAction?.type === "rotate" ? "Rotate credential" : "Revoke credential"}
        destructive={confirmAction?.type === "revoke"}
        onConfirm={confirmCredentialAction}
      />
    </div>
  );
}

function StatusCell({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof ServerCog;
  label: string;
  value: string;
  detail: string;
  tone: "orange" | "blue" | "green";
}) {
  const toneClasses = {
    orange: "bg-signal-orange/10 text-signal-orange",
    blue: "bg-signal-blue/10 text-signal-blue",
    green: "bg-signal-green/10 text-signal-green",
  };
  return (
    <div className="border-border/80 flex items-center gap-3 border-b p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:p-5 sm:last:border-r-0">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${toneClasses[tone]}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="data-stamp text-muted-foreground uppercase tracking-[0.08em]">{label}</p>
        <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
          <p className="truncate text-sm font-semibold capitalize">{value}</p>
          <span className="text-muted-foreground hidden truncate text-[11px] lg:inline">
            {detail}
          </span>
        </div>
      </div>
    </div>
  );
}

function CredentialRow({
  credential,
  actorById,
  onEdit,
  onRotate,
  onRevoke,
}: {
  credential: Credential;
  actorById: Map<string, ActorOption>;
  onEdit: () => void;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const status = credentialStatus(credential);
  const actorNames = credential.actorIds.map((id) => {
    const actor = actorById.get(id);
    return actor ? actorLabel(actor) : id;
  });
  const actorAccess =
    actorNames.length === 0
      ? "All workspace actors"
      : actorNames.length <= 2
        ? actorNames.join(", ")
        : `${actorNames.slice(0, 2).join(", ")} +${actorNames.length - 2}`;
  const statusStyles = {
    active: "border-signal-green/35 bg-signal-green/5 text-signal-green",
    expired: "border-signal-orange/35 bg-signal-orange/5 text-signal-orange",
    revoked: "border-border bg-muted/50 text-muted-foreground",
  };

  return (
    <tr
      className={`align-top transition-colors ${status === "revoked" ? "bg-muted/20" : "hover:bg-muted/20"}`}
    >
      <td className="px-5 py-4">
        <div className="flex min-w-[190px] flex-wrap items-center gap-2">
          <span className="font-semibold">{credential.name}</span>
          <Badge variant="outline" className={`capitalize ${statusStyles[status]}`}>
            {status === "active" ? (
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
            ) : null}
            {status}
          </Badge>
          {credential.rotatedAt ? (
            <Badge variant="outline" className="text-muted-foreground">
              Rotated
            </Badge>
          ) : null}
        </div>
        <code className="text-muted-foreground mt-1 block text-xs">{credential.keyPreview}</code>
      </td>
      <td className="text-muted-foreground max-w-[210px] px-5 py-4 text-xs">
        <span className="flex items-start gap-1.5">
          <UsersRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{actorAccess}</span>
        </span>
        <span className="mt-1 block text-[11px]">ActorConsole MCP only</span>
        <span className="mt-1 block text-[11px]">
          {credential.permissions?.length || ALL_MCP_PERMISSIONS.length} permissions
        </span>
      </td>
      <td className="whitespace-nowrap px-5 py-4 text-xs font-medium">
        {formatDateTime(credential.lastUsedAt)}
      </td>
      <td className="text-muted-foreground whitespace-nowrap px-5 py-4 text-xs">
        {credential.expiresAt ? formatDate(credential.expiresAt) : "No expiry"}
      </td>
      <td className="text-muted-foreground whitespace-nowrap px-5 py-4 text-xs">
        {formatDate(credential.createdAt)}
      </td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-1.5">
          {status !== "revoked" ? (
            <>
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" variant="outline" onClick={onRotate}>
                <RotateCcw className="h-3.5 w-3.5" /> Rotate
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-9 w-9"
                onClick={onRevoke}
                aria-label={`Revoke ${credential.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">No actions</span>
          )}
        </div>
      </td>
    </tr>
  );
}
