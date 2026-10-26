import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuilderActorDetail, BuilderProfile } from "@/lib/builders";
import BuilderPage from "@/app/(marketing)/builders/[username]/view";
import ActorPage from "@/app/(marketing)/builders/[username]/actors/[actorName]/view";

vi.mock("@/lib/builders", () => ({ BUILDER_WINDOWS: [7, 30, 90], BUILDER_ACTOR_SORTS: [] }));
vi.mock("@/components/marketing/builder-profile-chart", () => ({
  BuilderProfileChart: () => <div data-testid="history">Recorded history</div>,
}));
vi.mock("@/components/marketing/builder-actor-view-toggle", () => ({
  BuilderActorViewToggle: () => null,
}));
vi.mock("@/components/marketing/public-actor-documentation", () => ({
  PublicActorDocumentation: () => <div>Live documentation</div>,
}));
vi.mock("@/components/comparison/public-comparison-provider", () => ({
  PublicCompareButton: () => <button>Compare listing</button>,
}));
afterEach(cleanup);

const profile = {
  username: "retired",
  name: "Retired Builder",
  bio: null,
  pictureUrl: null,
  apifyUrl: "https://apify.com/retired",
  actorCount: 0,
  activeUsers: 0,
  totalUsers: 0,
  recentRuns: 0,
  totalRuns: 0,
  newActorCount: 0,
  ranks: {},
  totalBuilders: 10,
  lastUpdatedAt: new Date("2026-10-05"),
  window: 30,
  publishingChart: [],
  trendChart: [],
  actors: [],
  actorPage: 1,
  actorPageCount: 1,
  actorTotal: 0,
  actorCategories: [],
  actorFilters: { query: "", category: "", sort: "active-users" },
  changes: { users: 999, runs: null },
} as BuilderProfile;

describe("public catalog page availability", () => {
  it("shows unknown publication counts as unavailable and never as a rank", async () => {
    render(
      await BuilderPage({
        params: Promise.resolve({ username: "retired" }),
        searchParams: Promise.resolve({}),
        initialData: {
          ...profile,
          isAvailable: true,
          actorCount: 74,
          newActorCount: null,
          publicationDateCoverage: { known: 0, total: 74 },
          ranks: {
            "new-actors": 50,
            actors: 1,
            "monthly-users": 1,
            "total-users": 1,
            "monthly-runs": 1,
            "total-runs": 1,
            "estimated-revenue": 1,
          },
        },
      }),
    );
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Publication dates incomplete")).toBeTruthy();
    expect(screen.queryByText("#50")).toBeNull();
  });

  it("preserves an archived builder's history without displaying current ranks, usage or broken Store links", async () => {
    render(
      await BuilderPage({
        params: Promise.resolve({ username: "retired" }),
        searchParams: Promise.resolve({}),
        initialData: { ...profile, isAvailable: false },
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("excluded from current rankings");
    expect(screen.getByTestId("history")).toBeTruthy();
    expect(screen.queryByText("Portfolio stats")).toBeNull();
    expect(screen.queryByRole("button", { name: "Compare listing" })).toBeNull();
    expect(screen.queryByRole("link", { name: "View on Apify" })).toBeNull();
    expect(screen.getByText(/Last observed/).textContent).toContain("5 Oct 2026");
  });

  it.each([7, 90])("hides a cached 30-day growth figure beside %s-day usage", async (window) => {
    render(
      await BuilderPage({
        params: Promise.resolve({ username: "retired" }),
        searchParams: Promise.resolve({ window: String(window) }),
        initialData: { ...profile, isAvailable: true },
      }),
    );
    expect(screen.queryByText(/999 since first snapshot/)).toBeNull();
  });

  it("labels archived Actor metrics as historical and suppresses live documentation and comparison", async () => {
    const actor = {
      ...profile,
      isAvailable: false,
      id: "old",
      name: "old",
      title: "Old Actor",
      description: "Historical Actor",
      apifyActorId: "immutable-old",
      ownerName: "Retired Builder",
      createdAt: null,
      modifiedAt: null,
      firstPublishedAt: null,
      firstSeenAt: new Date("2026-08-08"),
      lastSeenAt: new Date("2026-10-05"),
      detailsSyncedAt: null,
      bookmarks: 0,
      rating: null,
      reviewCount: 0,
      users7Days: 1,
      users30Days: 2,
      users90Days: 3,
      runs30Days: 4,
      categories: [],
      metaLabels: [],
      pricing: [],
      trend: [],
      relatedActors: [],
    } as unknown as BuilderActorDetail;
    render(
      await ActorPage({
        params: Promise.resolve({ username: "retired", actorName: "old" }),
        searchParams: Promise.resolve({}),
        initialData: actor,
      }),
    );
    expect(screen.getByText("Archived Apify Actor")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "metrics and pricing below are historical",
    );
    expect(screen.queryByRole("button", { name: "Compare listing" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open on Apify" })).toBeNull();
    expect(screen.queryByText("Live documentation")).toBeNull();
  });
});
