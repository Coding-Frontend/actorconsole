import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the ActorSnapshot retention job (Phase 4.7).
 *
 * Mocks @actorconsole/db and @sentry/node. The retention module reads the
 * retention window from process.env.ACTOR_SNAPSHOT_RETENTION_DAYS on
 * every call.
 */

const { mockDeleteMany, mockSentryBreadcrumb, mockLogInfo, mockLogError } = vi.hoisted(() => ({
  mockDeleteMany: vi.fn(),
  mockSentryBreadcrumb: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  db: {
    actorSnapshot: {
      deleteMany: mockDeleteMany,
    },
  },
}));

vi.mock("@sentry/node", () => ({
  addBreadcrumb: mockSentryBreadcrumb,
}));

vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ info: mockLogInfo, error: mockLogError }),
}));

import { pruneOldSnapshots, snapshotRetentionDays } from "../../src/lib/retention.js";

describe("ActorSnapshot retention (Phase 4.7)", () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.ACTOR_SNAPSHOT_RETENTION_DAYS;
    mockDeleteMany.mockReset();
    mockSentryBreadcrumb.mockReset();
    mockLogInfo.mockReset();
    mockLogError.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("snapshotRetentionDays", () => {
    it("defaults to 90 when no env var is set", () => {
      expect(snapshotRetentionDays()).toBe(90);
    });

    it("reads the env var when set", () => {
      process.env.ACTOR_SNAPSHOT_RETENTION_DAYS = "30";
      expect(snapshotRetentionDays()).toBe(30);
    });

    it.each(["0", "-1", "1.5", "NaN", "3651"])("rejects invalid value %s", (value) => {
      process.env.ACTOR_SNAPSHOT_RETENTION_DAYS = value;
      expect(() => snapshotRetentionDays()).toThrow(
        "ACTOR_SNAPSHOT_RETENTION_DAYS must be an integer",
      );
    });
  });

  describe("pruneOldSnapshots", () => {
    it("calls deleteMany with a 90-day cutoff by default", async () => {
      const now = Date.now();
      mockDeleteMany.mockResolvedValue({ count: 0 });
      await pruneOldSnapshots();
      expect(mockDeleteMany).toHaveBeenCalledTimes(1);
      const whereArg = mockDeleteMany.mock.calls[0][0].where;
      const cutoff = whereArg.capturedAt.lt.getTime();
      // 89-91 days ago (allow for ms rounding)
      expect(now - cutoff).toBeGreaterThanOrEqual(89 * 86_400_000);
      expect(now - cutoff).toBeLessThanOrEqual(91 * 86_400_000);
    });

    it("honours ACTOR_SNAPSHOT_RETENTION_DAYS", async () => {
      process.env.ACTOR_SNAPSHOT_RETENTION_DAYS = "30";
      const now = Date.now();
      mockDeleteMany.mockResolvedValue({ count: 0 });
      await pruneOldSnapshots();
      const cutoff = mockDeleteMany.mock.calls[0][0].where.capturedAt.lt.getTime();
      expect(now - cutoff).toBeGreaterThanOrEqual(29 * 86_400_000);
      expect(now - cutoff).toBeLessThanOrEqual(31 * 86_400_000);
    });

    it("emits a Sentry breadcrumb and a structured log when rows are deleted", async () => {
      mockDeleteMany.mockResolvedValue({ count: 7 });
      const result = await pruneOldSnapshots();
      expect(result).toBe(7);
      expect(mockSentryBreadcrumb).toHaveBeenCalledTimes(1);
      expect(mockSentryBreadcrumb.mock.calls[0][0]).toMatchObject({
        category: "retention",
        level: "info",
        data: { retentionDays: 90 },
      });
      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.objectContaining({ count: 7, retentionDays: 90 }),
        "Pruned actor snapshots",
      );
    });

    it("does NOT emit a breadcrumb when nothing was pruned", async () => {
      mockDeleteMany.mockResolvedValue({ count: 0 });
      const result = await pruneOldSnapshots();
      expect(result).toBe(0);
      expect(mockSentryBreadcrumb).not.toHaveBeenCalled();
    });

    it("swallows DB errors, logs them, and returns null", async () => {
      mockDeleteMany.mockRejectedValue(new Error("ECONNREFUSED"));
      const result = await pruneOldSnapshots();
      expect(result).toBeNull();
      expect(mockLogError).toHaveBeenCalled();
    });
  });
});
