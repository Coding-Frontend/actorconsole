"use client";
import { createContext, useContext } from "react";
import type { WorkspaceAccess } from "@actorconsole/shared/workspace-access";

export const WorkspaceAccessContext = createContext<{
  access: WorkspaceAccess | null;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}>({ access: null, loading: true, error: false, refresh: () => {} });
export const useWorkspaceAccess = () => useContext(WorkspaceAccessContext);
