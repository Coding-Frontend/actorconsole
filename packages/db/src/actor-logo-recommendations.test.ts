import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

vi.mock("./client.js", () => ({ db: {} }));
import { reconcileActorLogoRecommendations } from "./actor-logo-recommendations.js";

type Actor = {
  id: string;
  userId: string;
  businessProfileId: string;
  apifyRemovedAt: Date | null;
  websiteIdentity: {
    status: string;
    currentLogo: { id: string; reviewStatus: string } | null;
  } | null;
};
type Recommendation = { actorId: string; logoId: string; status: string; error?: string | null };
let actors: Actor[];
let recommendations: Recommendation[];
const client = {
  actor: {
    findMany: vi.fn(
      async ({
        where,
        cursor,
        take,
      }: {
        where: { userId?: string; businessProfileId?: string };
        cursor?: { id: string };
        take: number;
      }) =>
        actors
          .filter(
            (actor) =>
              (!where.userId || actor.userId === where.userId) &&
              (!where.businessProfileId || actor.businessProfileId === where.businessProfileId) &&
              (!cursor || actor.id > cursor.id),
          )
          .slice(0, take),
    ),
  },
  actorLogoRecommendation: {
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { actorId: { in: string[] }; status: string; logoId?: string | { not: string } };
        data: { status: string; error: null };
      }) => {
        const matches = recommendations.filter(
          (item) =>
            where.actorId.in.includes(item.actorId) &&
            item.status === where.status &&
            (!where.logoId ||
              (typeof where.logoId === "string"
                ? item.logoId === where.logoId
                : item.logoId !== where.logoId.not)),
        );
        matches.forEach((item) => Object.assign(item, data));
        return { count: matches.length };
      },
    ),
    createMany: vi.fn(async ({ data }: { data: Array<{ actorId: string; logoId: string }> }) => {
      let count = 0;
      for (const item of data) {
        if (
          recommendations.some(
            (saved) => saved.actorId === item.actorId && saved.logoId === item.logoId,
          )
        )
          continue;
        recommendations.push({ ...item, status: "PENDING" });
        count += 1;
      }
      return { count };
    }),
  },
};
const reconcile = () =>
  reconcileActorLogoRecommendations(
    { userId: "user_1", businessProfileId: "workspace_1" },
    client as unknown as Prisma.TransactionClient,
  );
function actor(id: string): Actor {
  return {
    id,
    userId: "user_1",
    businessProfileId: "workspace_1",
    apifyRemovedAt: null,
    websiteIdentity: { status: "ACTIVE", currentLogo: { id: "logo_1", reviewStatus: "APPROVED" } },
  };
}

describe("Actor logo recommendation reconciliation", () => {
  beforeEach(() => {
    actors = [];
    recommendations = [];
    vi.clearAllMocks();
  });

  it("recommends an already active logo to Actors arriving later without duplicating existing choices", async () => {
    actors = [actor("a1"), actor("a2"), actor("a3"), actor("a4")];
    recommendations = [
      { actorId: "a1", logoId: "logo_1", status: "APPLIED" },
      { actorId: "a2", logoId: "logo_1", status: "DISMISSED" },
      { actorId: "a3", logoId: "logo_1", status: "PENDING" },
    ];
    expect(await reconcile()).toEqual({ created: 1 });
    expect(await reconcile()).toEqual({ created: 0 });
    expect(recommendations.map((item) => item.status)).toEqual([
      "APPLIED",
      "DISMISSED",
      "PENDING",
      "PENDING",
    ]);
  });

  it("covers every Actor beyond the batch size without leaking into another workspace", async () => {
    actors = Array.from({ length: 501 }, (_, index) =>
      actor(`actor_${String(index).padStart(4, "0")}`),
    );
    actors.push({ ...actor("other_actor"), businessProfileId: "workspace_2" });
    expect(await reconcile()).toEqual({ created: 501 });
    expect(recommendations).toHaveLength(501);
    expect(recommendations.some((item) => item.actorId === "other_actor")).toBe(false);
    expect(client.actor.findMany).toHaveBeenCalledTimes(4);
    expect(
      client.actorLogoRecommendation.createMany.mock.calls.every(
        ([args]) => args.data.length <= 250,
      ),
    ).toBe(true);
  });

  it("replaces stale pending recommendations after reassignment and restores a superseded version on rollback", async () => {
    actors = [actor("a1")];
    recommendations = [
      { actorId: "a1", logoId: "old_logo", status: "PENDING", error: "old error" },
      { actorId: "a1", logoId: "logo_1", status: "SUPERSEDED" },
    ];
    await reconcile();
    expect(recommendations).toEqual([
      { actorId: "a1", logoId: "old_logo", status: "SUPERSEDED", error: null },
      { actorId: "a1", logoId: "logo_1", status: "PENDING", error: null },
    ]);
  });

  it.each(["unassigned", "missing", "archived", "unreviewed", "removed"])(
    "closes stale proposals and does not recommend unavailable logos: %s",
    async (state) => {
      const row = actor("a1");
      if (state === "unassigned") row.websiteIdentity = null;
      if (state === "missing") row.websiteIdentity!.currentLogo = null;
      if (state === "archived") row.websiteIdentity!.status = "ARCHIVED";
      if (state === "unreviewed") row.websiteIdentity!.currentLogo!.reviewStatus = "PENDING";
      if (state === "removed") row.apifyRemovedAt = new Date();
      actors = [row];
      recommendations = [{ actorId: row.id, logoId: "logo_1", status: "PENDING" }];
      expect(await reconcile()).toEqual({ created: 0 });
      expect(recommendations[0].status).toBe("SUPERSEDED");
      expect(client.actorLogoRecommendation.createMany).not.toHaveBeenCalled();
    },
  );
});
