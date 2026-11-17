"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { WebSession } from "@actorconsole/shared/web-session";
import { navigateInApp } from "./client-navigation";
import {
  ANONYMOUS_SESSION_KEY,
  clearAnonymousSession,
  notifySessionChanged,
  SESSION_CHANGED_EVENT,
} from "./session-events";
import { fetchRead } from "./read-request";
type SessionState = {
  data: WebSession | null;
  status: "loading" | "authenticated" | "unauthenticated";
};
const SessionContext = createContext<SessionState>({ data: null, status: "loading" });
const ANONYMOUS_SESSION_TTL_MS = 10 * 60_000;

function hasRecentAnonymousSession() {
  try {
    const until = Number(window.localStorage.getItem(ANONYMOUS_SESSION_KEY));
    const now = Date.now();
    return until > now && until - now <= ANONYMOUS_SESSION_TTL_MS;
  } catch {
    return false;
  }
}

export function SessionProvider({
  children,
  initialSession,
  reuseAnonymousSession = false,
}: {
  children: ReactNode;
  initialSession?: WebSession;
  reuseAnonymousSession?: boolean;
}) {
  const [state, setState] = useState<SessionState>(
    initialSession
      ? { data: initialSession, status: "authenticated" }
      : { data: null, status: "loading" },
  );
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let lastAttempt = initialSession ? Date.now() : -Infinity;
    let controller = new AbortController();
    let generation = 0;
    const refresh = async (force = false) => {
      if (!force && (inFlight || Date.now() - lastAttempt < 30_000)) return;
      if (!force && reuseAnonymousSession && hasRecentAnonymousSession()) {
        setState({ data: null, status: "unauthenticated" });
        return;
      }
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
        if (active && requestGeneration === generation) {
          if (data) {
            clearAnonymousSession();
          } else if (reuseAnonymousSession && data === null) {
            try {
              window.localStorage.setItem(
                ANONYMOUS_SESSION_KEY,
                String(Date.now() + ANONYMOUS_SESSION_TTL_MS),
              );
            } catch {
              // Session verification still works without browser storage.
            }
          }
          setState({ data, status: data ? "authenticated" : "unauthenticated" });
        }
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
    const storageChanged = (event: StorageEvent) => {
      if (reuseAnonymousSession && event.key === ANONYMOUS_SESSION_KEY && event.newValue === null)
        void refresh(true);
    };
    if (initialSession) {
      clearAnonymousSession();
      setState({ data: initialSession, status: "authenticated" });
    } else {
      void refresh();
    }
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(SESSION_CHANGED_EVENT, sessionChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(SESSION_CHANGED_EVENT, sessionChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, [initialSession, reuseAnonymousSession]);
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
