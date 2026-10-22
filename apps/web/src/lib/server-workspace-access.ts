import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import {
  isWorkspaceAccess,
  WORKSPACE_ACCESS_HEADER,
  type WorkspaceAccess,
} from "@actorconsole/shared/workspace-access";
import { authenticatedServerFetch } from "./server-api";

export const getServerWorkspaceAccess = cache(async (): Promise<WorkspaceAccess | null> => {
  const passed = (await headers()).get(WORKSPACE_ACCESS_HEADER);
  if (passed) {
    try {
      const access = JSON.parse(passed);
      if (isWorkspaceAccess(access)) return access;
    } catch {
      /* Reload below. */
    }
  }
  try {
    const response = await authenticatedServerFetch("/account/workspace-access");
    const body = await response.json();
    return response.ok && isWorkspaceAccess(body.data) ? body.data : null;
  } catch {
    return null;
  }
});
