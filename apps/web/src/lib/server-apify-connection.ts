import "server-only";
import { cache } from "react";
import { authenticatedServerFetch } from "@/lib/server-api";
import type { WorkspaceApifyConnection } from "@/lib/workspace-apify-connection";

/** Database-first status for the currently selected workspace; never validates against Apify. */
export const loadWorkspaceApifyConnection = cache(
  async (): Promise<WorkspaceApifyConnection | null> => {
    try {
      const response = await authenticatedServerFetch("/apify/status");
      if (!response.ok) return null;
      const body = await response.json();
      return typeof body.data?.connected === "boolean" ? body.data : null;
    } catch {
      return null;
    }
  },
);
