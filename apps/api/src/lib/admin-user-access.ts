import { AppError } from "../middleware/error.js";

/** Use the same privileged-target boundary for every suspension-state write. */
export function assertCanManageUserSuspension(adminRole: string, targetRole: string): void {
  if (targetRole !== "USER" && adminRole !== "SUPER_ADMIN") {
    throw new AppError("super_admin_required", "A super administrator must manage this account", 403);
  }
}
