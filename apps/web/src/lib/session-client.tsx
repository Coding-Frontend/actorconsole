"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { WebSession } from "@actorconsole/shared/web-session";
import { navigateInApp } from "./client-navigation";
import { notifySessionChanged, SESSION_CHANGED_EVENT } from "./session-events";
import { fetchRead } from "./read-request";
type SessionState = {
  data: WebSession | null;
  status: "loading" | "authenticated" | "unauthenticated";
};
const SessionContext = createContext<SessionState>({ data: null, status: "loading" });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ data: null, status: "loading" });
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let lastAttempt = -Infinity;
    let controller = new AbortController();
    let generation = 0;
    const refresh = async (force = false) => {
      if (!force && (inFlight || Date.now() - lastAttempt < 30_000)) return;
      if (force) {
        controller.abort();
        controller = new AbortController();
        setState({ data: null, status: "loading" });
      }
      const requestGeneration = ++generation;
      inFlight = true;
      lastAttempt = Date.now();
      try {
        const response = await fetchRead("/api/auth/session", {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
        });
        if (!response.ok) throw new Error("Session unavailable");
        const data: WebSession | null = await response.json();
        if (active && requestGeneration === generation)
          setState({ data, status: data ? "authenticated" : "unauthenticated" });
      } catch {
        if (active && requestGeneration === generation)
          setState((value) =>
            value.status === "loading" ? { data: null, status: "unauthenticated" } : value,
          );
      } finally {
        if (requestGeneration === generation) inFlight = false;
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const sessionChanged = () => {
      void refresh(true);
    };
    void refresh();
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(SESSION_CHANGED_EVENT, sessionChanged);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(SESSION_CHANGED_EVENT, sessionChanged);
    };
  }, []);
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
export function useSession() {
  return useContext(SessionContext);
}
export async function signOut(options: { redirectTo?: string } = {}) {
  const response = await fetch("/api/auth/signout", { method: "POST" });
  if (!response.ok) throw new Error("Unable to sign out");
  notifySessionChanged();
  const target = options.redirectTo ?? "/";
  navigateInApp(target.startsWith("/") && !target.startsWith("//") ? target : "/", true);
}
