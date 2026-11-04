"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { API_BASE_URL } from "@/lib/api-base";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "./dashboard-navigation";
import { WORKSPACE_CHANGED_EVENT } from "./onboarding-gate";
import type { WorkspaceApifyConnection } from "@/lib/workspace-apify-connection";

type ConnectionState = {
  workspaceId: string | null;
  status: WorkspaceApifyConnection | null;
  loading: boolean;
  refresh: () => void;
};
const ConnectionContext = createContext<ConnectionState>({
  workspaceId: null,
  status: null,
  loading: true,
  refresh: () => {},
});
export const useWorkspaceApifyConnection = () => useContext(ConnectionContext);

/** One status request per active workspace, shared by every dashboard consumer. */
export function WorkspaceApifyConnectionProvider({
  workspaceId,
  children,
}: {
  workspaceId: string | null;
  children: ReactNode;
}) {
  const [result, setResult] = useState<Omit<ConnectionState, "refresh"> | null>(null);
  const [revision, setRevision] = useState(0);
  const queued = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    // Credential changes and synchronization can dispatch both events together.
    if (queued.current) return;
    queued.current = true;
    queueMicrotask(() => {
      queued.current = false;
      setRevision((value) => value + 1);
    });
  }, []);
  useEffect(() => {
    const switching = () => {
      activeRequest.current?.abort();
      setResult(null);
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, switching);
    window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
    window.addEventListener(DASHBOARD_STATUS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, switching);
      window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refresh);
      window.removeEventListener(DASHBOARD_STATUS_CHANGED_EVENT, refresh);
    };
  }, [refresh]);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setResult((previous) => ({
      workspaceId,
      status: previous?.workspaceId === workspaceId ? previous.status : null,
      loading: true,
    }));
    void (async () => {
      let status: WorkspaceApifyConnection | null = null;
      try {
        const response = await fetch(`${API_BASE_URL}/apify/status`, {
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
          headers: { "x-business-profile-id": workspaceId },
        });
        if (response.ok) {
          const body = await response.json();
          if (typeof body.data?.connected === "boolean") status = body.data;
        }
      } catch {
        /* A failed check is distinct from a disconnected account. */
      }
      if (!controller.signal.aborted) setResult({ workspaceId, status, loading: false });
    })();
    return () => controller.abort();
  }, [workspaceId, revision]);
  const current = result?.workspaceId === workspaceId ? result : null;
  return (
    <ConnectionContext.Provider
      value={{
        workspaceId,
        status: current?.status ?? null,
        loading: current?.loading ?? true,
        refresh,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}
