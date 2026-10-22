import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

import { BulkPublishingNewSchedule } from "./bulk-publishing-new-schedule";

const privateActor = {
  id: "private-1",
  apifyActorId: "owner~private-actor",
  username: "owner",
  actorName: "private-actor",
  title: "Private Actor",
  currentImageUrl: null,
  storeIsPublic: false,
  storeIsDeprecated: false,
  storeNotice: "NONE",
  storeStatusSyncedAt: null,
};

const publishedActor = {
  ...privateActor,
  id: "published-1",
  apifyActorId: "owner~published-actor",
  actorName: "published-actor",
  title: "Published Actor",
  storeIsPublic: true,
};

describe("BulkPublishingNewSchedule", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    router.push.mockReset();
    router.refresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          data: { items: [privateActor, publishedActor], total: 2 },
        }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requests and displays private Actors only", async () => {
    render(<BulkPublishingNewSchedule />);

    await waitFor(() => expect(screen.getByText("Private Actor")).toBeTruthy());

    expect(screen.queryByText("Published Actor")).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/bulk-publishing/inventory?status=private"),
      expect.anything(),
    );
    expect(screen.getByText("Private Actors only")).toBeTruthy();
  });

  it("never clears the multi-Actor handoff while mounting the schedule page", async () => {
    const selected = [privateActor, { ...privateActor, id: "private-2", title: "Second Actor" }];
    const key = "actorconsole.bulk-publishing.selection.v1";
    window.sessionStorage.setItem(key, JSON.stringify(selected));
    const writes = vi.spyOn(window.sessionStorage, "setItem");
    render(<BulkPublishingNewSchedule />);
    await screen.findByText("Second Actor");
    expect(JSON.parse(window.sessionStorage.getItem(key)!)).toHaveLength(2);
    expect(
      writes.mock.calls
        .filter(([name]) => name === key)
        .every(([, data]) => JSON.parse(data).length === 2),
    ).toBe(true);
    writes.mockRestore();
  });
});
