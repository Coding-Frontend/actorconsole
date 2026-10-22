"use client";

import { navigateInApp } from "@/lib/client-navigation";

import { API_BASE_URL } from "@/lib/api-base";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  LayoutDashboard,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_DASHBOARD_PATH,
  isAllWorkspacesPath,
} from "@actorconsole/shared/default-dashboard";
import { Button } from "@/components/ui/button";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";
import { ConfirmDialog, PromptDialog } from "@/components/ui/action-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BusinessProfile {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  website: string | null;
  plan: "FREE" | "PRO";
  actorCount: number;
  apifyUsername: string | null;
  apiKeyConfigured?: boolean;
  consoleConfigured?: boolean;
  credentialStatus: "CONNECTED" | "ISSUE" | "NOT_CONFIGURED";
  active: boolean;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function connectionLabel(profile: BusinessProfile) {
  if (profile.credentialStatus === "ISSUE") return "Connection needs attention";
  if (profile.apiKeyConfigured && profile.consoleConfigured) return "API and Console connected";
  if (profile.consoleConfigured) return "Console connected · API key needed";
  if (profile.apiKeyConfigured) return "API key connected · Console optional";
  if (
    profile.credentialStatus === "CONNECTED" &&
    profile.apiKeyConfigured == null &&
    profile.consoleConfigured == null
  )
    return "Apify connected";
  return "No Apify connection";
}

export function BusinessProfileSwitcher({
  variant = "topbar",
}: {
  variant?: "topbar" | "sidebar";
}) {
  const inSidebar = variant === "sidebar";
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [manageWorkspaceOpen, setManageWorkspaceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [renameWorkspace, setRenameWorkspace] = useState<BusinessProfile | null>(null);
  const [deleteWorkspace, setDeleteWorkspace] = useState<BusinessProfile | null>(null);

  const active = profiles.find((profile) => profile.active) ?? profiles[0] ?? null;
  const defaultSelected = isAllWorkspacesPath(pathname);
  const selectedName = defaultSelected ? "All Workspaces" : active?.name;

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    const loadProfiles = () => {
      const requestGeneration = ++generation;
      setLoading(true);
      fetch(`${API_BASE_URL}/account/business-profiles`, {
        credentials: "include",
        signal: AbortSignal.timeout(12_000),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (!cancelled && requestGeneration === generation) setProfiles(body?.data ?? []);
        })
        .catch(() => {
          if (!cancelled && requestGeneration === generation)
            setError("Workspaces are temporarily unavailable.");
        })
        .finally(() => {
          if (!cancelled && requestGeneration === generation) setLoading(false);
        });
    };
    loadProfiles();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, loadProfiles);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, loadProfiles);
    };
  }, []);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);

  async function selectProfile(profile: BusinessProfile) {
    if (pending) return;
    if (profile.id === active?.id) {
      if (defaultSelected) {
        setOpen(false);
        navigateInApp("/dashboard");
      }
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/account/business-profiles/${profile.id}/select`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Workspace switch failed");
      setProfiles((current) =>
        current.map((item) => ({ ...item, active: item.id === profile.id })),
      );
      setOpen(false);
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
      // The router hides old workspace content while authorization revalidates.
      // Entity details return to the overview in the newly selected scope.
      const target =
        defaultSelected || /^\/dashboard\/(actors|schedules)\/[^/]+/.test(pathname)
          ? "/dashboard"
          : pathname;
      navigateInApp(target);
      setPending(false);
    } catch {
      setError("Could not switch workspace.");
      setPending(false);
    }
  }

  async function createProfile(nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/account/business-profiles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Could not create workspace.");
      }
      const created = body?.data as BusinessProfile;
      setProfiles((current) => [
        ...current.map((item) => ({ ...item, active: false })),
        {
          ...created,
          actorCount: 0,
          apifyUsername: null,
          apiKeyConfigured: false,
          consoleConfigured: false,
          credentialStatus: "NOT_CONFIGURED",
          active: true,
        },
      ]);
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
      navigateInApp("/dashboard/onboarding");
      setPending(false);
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Could not create workspace.";
      setError(message);
      setPending(false);
      throw new Error(message);
    }
  }

  async function renameProfile(profile: BusinessProfile, nextName: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/account/business-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: nextName }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not rename workspace.");
      }
      setProfiles((current) =>
        current.map((item) => (item.id === profile.id ? { ...item, name: nextName } : item)),
      );
    } catch (renameError) {
      const message =
        renameError instanceof Error ? renameError.message : "Could not rename workspace.";
      setError(message);
      throw new Error(message);
    } finally {
      setPending(false);
    }
  }

  async function deleteProfile(profile: BusinessProfile) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/account/business-profiles/${profile.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error?.message ?? "Could not delete workspace.");
      }
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
      navigateInApp("/dashboard");
      setPending(false);
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : "Could not delete workspace.";
      setError(message);
      setPending(false);
      throw new Error(message);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-label="Select workspace"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "workbench-control border-border bg-card hover:border-signal-blue/50 hover:bg-accent focus-visible:ring-ring flex min-w-0 items-center gap-2 rounded-sm border px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2",
          inSidebar ? "h-11 w-full" : "h-9 max-w-[210px] sm:max-w-[240px]",
        )}
      >
        <span className="bg-signal-blue/12 text-signal-blue flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[10px] font-semibold">
          {defaultSelected ? (
            <LayoutDashboard className="h-3.5 w-3.5" />
          ) : active ? (
            initials(active.name)
          ) : (
            <Building2 className="h-3.5 w-3.5" />
          )}
        </span>
        {inSidebar ? (
          <span className="dashboard-workspace-name min-w-0 flex-1 truncate text-[13px] font-semibold">
            {loading ? "Loading…" : (selectedName ?? "Set up a workspace")}
          </span>
        ) : (
          <>
            <span className="dashboard-workspace-name hidden min-w-0 flex-1 sm:block">
              <span className="data-stamp text-muted-foreground block text-[9px] uppercase tracking-[0.1em]">
                {defaultSelected ? "All workspaces" : "Workspace"}
              </span>
              <span className="block truncate text-xs font-semibold">
                {loading ? "Loading…" : (selectedName ?? "Set up a workspace")}
              </span>
            </span>
            <span className="dashboard-workspace-name block max-w-[90px] truncate text-xs font-semibold sm:hidden">
              {loading ? "Loading…" : (selectedName ?? "Workspace")}
            </span>
          </>
        )}
        <ChevronDown
          className={cn(
            "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "border-border bg-card absolute top-[calc(100%+0.5rem)] z-50 rounded-md border p-2 shadow-2xl",
            inSidebar ? "left-0 w-full" : "right-0 w-[min(330px,calc(100vw-2rem))]",
          )}
        >
          <div className="border-border/70 flex items-center justify-between border-b px-2 pb-2">
            <div>
              <p className="data-stamp text-muted-foreground text-[9px] uppercase tracking-[0.12em]">
                Workspaces
              </p>
              <p className="text-foreground mt-1 text-xs">Choose the workspace you are operating</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-sm p-1.5"
              aria-label="Close workspaces"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-60 space-y-1 overflow-y-auto py-2" role="menu">
            {profiles.length > 1 && (
              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  navigateInApp(DEFAULT_DASHBOARD_PATH);
                }}
                className={cn(
                  "hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2",
                  defaultSelected && "bg-signal-blue/8",
                )}
              >
                <span className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-sm">
                  <LayoutDashboard className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">All Workspaces</span>
                  <span className="text-muted-foreground block text-[11px]">
                    Earnings and publishing across all workspaces
                  </span>
                </span>
                {defaultSelected && <Check className="text-signal-blue h-4 w-4 shrink-0" />}
              </button>
            )}
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={cn(
                  "hover:bg-accent flex items-center rounded-sm transition-colors",
                  !defaultSelected && profile.id === active?.id && "bg-signal-blue/8",
                )}
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={pending}
                  onClick={() => void selectProfile(profile)}
                  className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2"
                >
                  <span className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-[10px] font-semibold">
                    {initials(profile.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="block truncate text-sm font-medium">{profile.name}</span>
                      {profile.credentialStatus === "ISSUE" && (
                        <AlertTriangle className="text-signal-orange h-3.5 w-3.5 shrink-0" />
                      )}
                    </span>
                    <span className="text-muted-foreground block truncate text-[11px]">
                      {connectionLabel(profile)}
                    </span>
                    {profile.apifyUsername ? (
                      <span className="text-muted-foreground block truncate text-[10px]">
                        @{profile.apifyUsername}
                      </span>
                    ) : null}
                  </span>
                  {!defaultSelected && profile.id === active?.id && (
                    <Check className="text-signal-blue h-4 w-4 shrink-0" />
                  )}
                </button>
              </div>
            ))}
          </div>

          <div className="border-border/70 grid gap-1 border-t pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreateWorkspaceOpen(true);
              }}
              className="text-signal-blue hover:bg-signal-blue/8 focus-visible:ring-ring flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2"
            >
              <Plus className="h-3.5 w-3.5" /> Create another workspace
            </button>
            {active && !defaultSelected ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setManageWorkspaceOpen(true);
                }}
                className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2"
              >
                <Pencil className="h-3.5 w-3.5" /> Manage current workspace
              </button>
            ) : null}
          </div>
          {error && (
            <p className="text-destructive mt-2 px-2 text-xs" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <PromptDialog
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        title="Create a workspace"
        description="Give this workspace a name. You can connect an Apify account after creating it."
        label="Workspace name"
        placeholder="e.g. Travel data studio"
        confirmLabel="Create workspace"
        onConfirm={createProfile}
      />
      <Dialog open={manageWorkspaceOpen} onOpenChange={setManageWorkspaceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{active?.name ?? "Workspace"}</DialogTitle>
            <DialogDescription>
              {active ? connectionLabel(active) : "Manage this workspace"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button asChild variant="outline" className="justify-start">
              <Link href="/dashboard/apify" onClick={() => setManageWorkspaceOpen(false)}>
                Manage Apify connection
              </Link>
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                setManageWorkspaceOpen(false);
                if (active) setRenameWorkspace(active);
              }}
            >
              <Pencil className="h-4 w-4" /> Rename workspace
            </Button>
            {profiles.length > 1 ? (
              <Button
                variant="outline"
                className="text-destructive justify-start"
                onClick={() => {
                  setManageWorkspaceOpen(false);
                  if (active) setDeleteWorkspace(active);
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete workspace
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <PromptDialog
        open={Boolean(renameWorkspace)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRenameWorkspace(null);
        }}
        title="Rename workspace"
        description="Change the active workspace name. Its actors, schedules, credentials, and reporting remain isolated."
        label="Workspace name"
        initialValue={renameWorkspace?.name ?? ""}
        confirmLabel="Rename workspace"
        onConfirm={async (nextName) => {
          if (!renameWorkspace) return;
          await renameProfile(renameWorkspace, nextName);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteWorkspace)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteWorkspace(null);
        }}
        title="Delete workspace?"
        description="This permanently deletes the workspace and its actors, schedules, credentials, notifications, MCP access keys, and reporting data."
        confirmLabel="Delete workspace"
        destructive
        onConfirm={async () => {
          if (!deleteWorkspace) return;
          await deleteProfile(deleteWorkspace);
        }}
      />
    </div>
  );
}
