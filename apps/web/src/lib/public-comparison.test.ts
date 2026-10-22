import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicCompareItem } from "@/components/comparison/public-comparison-items";

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  builders: vi.fn(),
  actor: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@actorconsole/shared", () => ({ getLogger: () => ({ error: mocks.logError }) }));
vi.mock("@/lib/builders", () => ({
  BUILDER_WINDOWS: [7, 30, 90],
  getBuilderComparisonHistory: mocks.history,
  getBuildersForComparison: mocks.builders,
  getBuilderActorDetail: mocks.actor,
  searchActorsForComparison: vi.fn(),
  searchBuildersForComparison: vi.fn(),
}));
vi.mock("@/components/comparison/public-comparison-items", () => ({
  builderCompareItem: (builder: PublicCompareItem) => ({ ...builder }),
  actorCompareItem: (_username: string, actor: PublicCompareItem) => ({ ...actor }),
}));

import { loadPublicComparison } from "./public-comparison";

const builder: PublicCompareItem = {
  id: "atlas",
  kind: "builder",
  username: "atlas",
  title: "Atlas",
  subtitle: "@atlas",
  window: 30,
  metrics: { activeUsers: 100 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.builders.mockResolvedValue([builder]);
  mocks.history.mockResolvedValue(new Map());
});

describe("public comparison history loading", () => {
  it("keeps incomplete portfolio snapshots as gaps while preserving observed zero", async () => {
    mocks.history.mockResolvedValue(
      new Map([
        [
          "atlas",
          [
            { date: "2026-10-02", users: 0, runs: 0, observed: true },
            { date: "2026-10-03", users: 25, runs: 80, observed: false },
          ],
        ],
      ]),
    );
    const result = await loadPublicComparison("builder", ["atlas", "missing", "bad/name"], 90);
    expect(mocks.history).toHaveBeenCalledWith(["atlas", "missing"], 90);
    expect(result.missing).toBe(2);
    expect(result.items[0]?.history).toEqual([
      { date: "2026-10-02", users: 0, runs: 0 },
      { date: "2026-10-03", users: null, runs: null },
    ]);
  });

  it("still returns the comparison metrics if historical storage is unavailable", async () => {
    mocks.history.mockRejectedValue(new Error("history unavailable"));
    const result = await loadPublicComparison("builder", ["atlas"], 30);
    expect(result.items[0]?.metrics.activeUsers).toBe(100);
    expect(result.items[0]?.history).toBeUndefined();
    expect(mocks.logError).toHaveBeenCalledOnce();
  });

  it("retains Actor history without requesting the builder portfolio history", async () => {
    const actor = {
      ...builder,
      kind: "actor",
      id: "atlas/scraper",
      history: [{ date: "2026-10-04", users: 10, runs: 50 }],
    };
    mocks.actor.mockResolvedValue(actor);
    const result = await loadPublicComparison("actor", ["atlas/scraper"], 7);
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.actor).toHaveBeenCalledWith("atlas", "scraper", 7);
    expect(result.items[0]?.history).toEqual(actor.history);
  });
});
