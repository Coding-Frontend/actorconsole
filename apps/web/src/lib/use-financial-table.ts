"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FinancialSortKey,
  FinancialTablePage,
  UsageCostsPayload,
} from "@actorconsole/shared/financial-report";
import { API_BASE_URL } from "./api-base";
import { useWorkspaceApifyConnection } from "@/components/dashboard/workspace-apify-connection-context";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";

export function useFinancialTable(
  kind: "usage" | "costs" | "revenue",
  details: UsageCostsPayload["details"],
  query: string,
  page: number,
  pageSize: number,
  sort: FinancialSortKey,
  direction: "asc" | "desc",
) {
  const connection = useWorkspaceApifyConnection();
  const [search, setSearch] = useState(query);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: FinancialTablePage;
    error?: string;
  } | null>(null);
  const exportController = useRef<AbortController | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const switching = () => {
      activeRequest.current?.abort();
      exportController.current?.abort();
      setResult(null);
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, switching);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, switching);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const params = new URLSearchParams(details?.query);
  params.set("format", "table");
  params.set("snapshotId", details?.snapshotId ?? "");
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("sort", sort);
  params.set("direction", direction);
  if (search.trim()) params.set("q", search.trim());
  const url = `${API_BASE_URL}/actors/${kind}?${params.toString()}`;
  const key = `${details?.snapshotId}:${url}`;
  // The dashboard can stay mounted while its selected workspace changes.
  const workspaceMatches =
    !connection.workspaceId || connection.workspaceId === details?.workspaceId;
  useEffect(() => {
    if (!details || !workspaceMatches) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    void (async () => {
      try {
        const response = await fetch(url, {
          credentials: "include",
          cache: "no-store",
          headers: details.workspaceId ? { "x-business-profile-id": details.workspaceId } : {},
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        if (!response.ok) throw new Error("Could not load report details");
        const body = await response.json();
        if (!controller.signal.aborted) setResult({ key, data: body.data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            error: error instanceof Error ? error.message : "Could not load report details",
          });
      }
    })();
    return () => controller.abort();
  }, [details, key, retry, url, workspaceMatches]);
  useEffect(
    () => () => {
      exportController.current?.abort();
    },
    [details, workspaceMatches],
  );
  const current = workspaceMatches && result?.key === key ? result : null;
  return {
    data: current?.data,
    loading: Boolean(details && (!current || search !== query)),
    error: current?.error,
    retry: () => setRetry((value) => value + 1),
    async allRows() {
      if (!details || !workspaceMatches)
        throw new Error("The workspace changed. Reload the report before exporting.");
      exportController.current?.abort();
      const controller = new AbortController();
      exportController.current = controller;
      const rows: FinancialTablePage["items"] = [];
      const exportParams = new URLSearchParams(params);
      exportParams.set("pageSize", "500");
      let nextPage = 1;
      do {
        exportParams.set("page", String(nextPage));
        const response = await fetch(`${API_BASE_URL}/actors/${kind}?${exportParams}`, {
          credentials: "include",
          cache: "no-store",
          headers: details.workspaceId ? { "x-business-profile-id": details.workspaceId } : {},
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        if (!response.ok) throw new Error("Could not export report details");
        const { data } = (await response.json()) as { data: FinancialTablePage };
        rows.push(...data.items);
        exportParams.set("snapshotId", data.snapshotId);
        if (rows.length >= data.total || !data.items.length) break;
        nextPage += 1;
      } while (!controller.signal.aborted);
      if (controller.signal.aborted) throw new Error("Export cancelled because the report changed");
      return rows;
    },
  };
}
