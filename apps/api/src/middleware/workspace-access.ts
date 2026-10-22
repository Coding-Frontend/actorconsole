import type { MiddlewareHandler } from "hono";
import { isRestrictedWorkspaceApiPath } from "@actorconsole/shared";
import { assertPlanFeature } from "../lib/plan-access.js";
import type { AppEnv } from "../app.js";

export const requireWorkspaceOperationalAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (isRestrictedWorkspaceApiPath(c.req.path))
    await assertPlanFeature(c.get("session"), "workspace_operations");
  await next();
};
