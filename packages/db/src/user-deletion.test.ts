import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("./index.js", () => ({ db: mockDb }));

import { cancelScheduledDeletion } from "./user-deletion.js";

describe("cancelScheduledDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores the original email when the grace period is cancelled", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      deletionScheduledFor: new Date(Date.now() + 60_000),
      deletionOriginalEmail: "builder@example.com",
    });
    mockDb.user.findFirst.mockResolvedValue(null);
    mockDb.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(cancelScheduledDeletion("user_1")).resolves.toBe(true);
    expect(mockDb.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user_1", deletionScheduledFor: { not: null } },
      data: expect.objectContaining({
        email: "builder@example.com",
        deletionOriginalEmail: null,
        deletionScheduledFor: null,
      }),
    });
  });

  it("refuses to restore an email claimed by a new account", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      deletionScheduledFor: new Date(Date.now() + 60_000),
      deletionOriginalEmail: "builder@example.com",
    });
    mockDb.user.findFirst.mockResolvedValue({ id: "new_user" });

    await expect(cancelScheduledDeletion("user_1")).rejects.toThrow("deletion_email_conflict");
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
  });

  it("returns false when there is no pending deletion", async () => {
    mockDb.user.findUnique.mockResolvedValue({ deletionScheduledFor: null, deletionOriginalEmail: null });

    await expect(cancelScheduledDeletion("user_1")).resolves.toBe(false);
    expect(mockDb.user.updateMany).not.toHaveBeenCalled();
  });
});
