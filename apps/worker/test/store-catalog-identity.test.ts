import { describe, expect, it, vi } from "vitest";
import type { ApifyActorDetail } from "@actorconsole/apify";
import { reconcileStoreActorIdentity } from "../src/lib/store-catalog-identity.js";

function fixture(rows: Array<{ id: string; apifyActorId: string; username: string; actorName: string; watches?: number }>) {
  const original = rows.map((r) => ({ ...r, isPublic: true, _count: { watches: r.watches ?? 0 } }));
  const stored = original.map((r) => ({ ...r }));
  const findUnique = vi.fn(async ({ where }) => stored.find((r) => where.id ? r.id === where.id : r.username === where.username_actorName.username && r.actorName === where.username_actorName.actorName) ?? null);
  const update = vi.fn(async ({ where, data }) => {
    const row = stored.find((r) => r.id === where.id)!;
    const next = { ...row, ...data };
    if (stored.some((r) => r.id !== row.id && r.username === next.username && r.actorName === next.actorName)) throw new Error("Unique name collision");
    Object.assign(row, data);
    return row;
  });
  const auditLog = { create: vi.fn().mockResolvedValue({}) };
  const tx = { storeActor: { findUnique, update }, auditLog };
  const database = { ...tx, $transaction: vi.fn(async (fn) => fn(tx)) };
  return { database, stored, original, update, auditLog };
}

describe("catalog identity reconciliation", () => {
  it("retains placeholder identity and relations, archives its public listing, and audits the canonical mapping", async () => {
    const f = fixture([
      { id: "real", apifyActorId: "immutable", username: "alice", actorName: "old" },
      { id: "placeholder", apifyActorId: "alice/new", username: "alice", actorName: "new" },
    ]);
    const live = { id: "immutable", username: "alice", name: "new" } as ApifyActorDetail;
    expect(await reconcileStoreActorIdentity({ getActor: vi.fn() }, "real", live, f.database as never)).toBe(2);
    expect(f.stored).toHaveLength(2);
    expect(f.stored[0]).toMatchObject({ id: "real", apifyActorId: "immutable", actorName: "new" });
    expect(f.stored[1]).toMatchObject({ id: "placeholder", apifyActorId: "alice/new", actorName: "catalog-alias-placeholder", isPublic: false });
    expect(f.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      before: expect.objectContaining({ actorName: "new", apifyActorId: "alice/new" }),
      after: expect.objectContaining({ canonicalStoreActorId: "real" }),
    }) }));
    expect(f.update.mock.calls.every(([call]) => !Object.keys(call.data).some((k) => ["snapshots", "watches", "apifyActorId"].includes(k)))).toBe(true);
  });

  it("swaps two real names without violating uniqueness or changing immutable IDs", async () => {
    const f = fixture([
      { id: "first", apifyActorId: "id1", username: "alice", actorName: "one" },
      { id: "second", apifyActorId: "id2", username: "alice", actorName: "two" },
    ]);
    const getActor = vi.fn().mockResolvedValue({ id: "id2", username: "alice", name: "one" });
    await reconcileStoreActorIdentity({ getActor }, "first", { id: "id1", username: "alice", name: "two" } as ApifyActorDetail, f.database as never);
    expect(f.stored.map((r) => [r.apifyActorId, r.actorName])).toEqual([["id1", "two"], ["id2", "one"]]);
    expect(f.database.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("refuses an unverified owner, a mismatched immutable ID, and watched placeholders without any writes", async () => {
    for (const [ownerId, watches, liveId] of [["other-id", 0, "id1"], ["alice/two", 1, "id1"], ["alice/two", 0, "wrong-id"]] as const) {
      const f = fixture([
        { id: "first", apifyActorId: "id1", username: "alice", actorName: "one" },
        { id: "second", apifyActorId: ownerId, username: "alice", actorName: "two", watches },
      ]);
      await expect(reconcileStoreActorIdentity({ getActor: vi.fn().mockResolvedValue(null) }, "first", { id: liveId, username: "alice", name: "two" } as ApifyActorDetail, f.database as never)).rejects.toThrow();
      expect(f.update).not.toHaveBeenCalled();
      expect(f.auditLog.create).not.toHaveBeenCalled();
    }
  });

  it("does nothing when the immutable Actor already owns its current listing", async () => {
    const f = fixture([{ id: "row", apifyActorId: "immutable", username: "alice", actorName: "one" }]);
    expect(await reconcileStoreActorIdentity({ getActor: vi.fn() }, "row", { id: "immutable", username: "alice", name: "one" } as ApifyActorDetail, f.database as never)).toBe(0);
    expect(f.database.$transaction).not.toHaveBeenCalled();
  });

  it("refuses two real Actors claiming one listing", async () => {
    const f = fixture([
      { id: "first", apifyActorId: "id1", username: "alice", actorName: "one" },
      { id: "second", apifyActorId: "id2", username: "alice", actorName: "two" },
    ]);
    await expect(reconcileStoreActorIdentity({ getActor: vi.fn().mockResolvedValue({ id: "id2", username: "alice", name: "two" }) }, "first", { id: "id1", username: "alice", name: "two" } as ApifyActorDetail, f.database as never)).rejects.toThrow("belongs to another");
    expect(f.update).not.toHaveBeenCalled();
  });

  it("aborts if a reviewed identity changes before the transaction starts", async () => {
    const f = fixture([
      { id: "first", apifyActorId: "id1", username: "alice", actorName: "one" },
      { id: "placeholder", apifyActorId: "alice/two", username: "alice", actorName: "two" },
    ]);
    f.database.$transaction.mockImplementationOnce(async (fn) => {
      f.stored[0].actorName = "changed-concurrently";
      return fn(f.database);
    });
    await expect(reconcileStoreActorIdentity({ getActor: vi.fn() }, "first", { id: "id1", username: "alice", name: "two" } as ApifyActorDetail, f.database as never)).rejects.toThrow("changed; retry");
    expect(f.update).not.toHaveBeenCalled();
  });
});
