import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const workspace = vi.hoisted(() => ({ id: "workspace-1" }));
vi.mock("@/components/dashboard/workspace-access-context", () => ({
  useWorkspaceAccess: () => ({ access: { workspaceId: workspace.id } }),
}));

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
    workspace.id = "workspace-1";
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
    vi.unstubAllEnvs();
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
    const key = "actorconsole.bulk-publishing.selection.v1:workspace-1";
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ workspaceId: "workspace-1", actors: selected }),
    );
    const writes = vi.spyOn(window.sessionStorage, "setItem");
    render(<BulkPublishingNewSchedule />);
    await screen.findByText("Second Actor");
    expect(JSON.parse(window.sessionStorage.getItem(key)!).actors).toHaveLength(2);
    expect(
      writes.mock.calls
        .filter(([name]) => name === key)
        .every(([, data]) => JSON.parse(data).actors.length === 2),
    ).toBe(true);
    writes.mockRestore();
  });

  it("never restores another workspace's saved publishing order", async () => {
    window.sessionStorage.setItem(
      "actorconsole.bulk-publishing.selection.v1:workspace-1",
      JSON.stringify({
        workspaceId: "workspace-1",
        actors: [{ ...privateActor, title: "Old workspace draft" }],
      }),
    );
    workspace.id = "workspace-2";
    render(<BulkPublishingNewSchedule />);
    await screen.findByText("Private Actor");
    expect(screen.queryByText("Old workspace draft")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Review and create" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("clears the previous workspace selection on an in-place workspace change", async () => {
    window.sessionStorage.setItem(
      "actorconsole.bulk-publishing.selection.v1:workspace-1",
      JSON.stringify({
        workspaceId: "workspace-1",
        actors: [{ ...privateActor, title: "Old workspace draft" }],
      }),
    );
    const view = render(<BulkPublishingNewSchedule />);
    await screen.findByText("Old workspace draft");
    workspace.id = "workspace-2";
    view.rerender(<BulkPublishingNewSchedule />);
    await waitFor(() => expect(screen.queryByText("Old workspace draft")).toBeNull());
    expect(
      JSON.parse(
        window.sessionStorage.getItem("actorconsole.bulk-publishing.selection.v1:workspace-2")!,
      ).actors,
    ).toEqual([]);
  });

  it("renders identical initial schedule markup across server and browser timezones", () => {
    vi.stubEnv("TZ", "UTC");
    const server = renderToString(<BulkPublishingNewSchedule />);
    vi.stubEnv("TZ", "Asia/Kolkata");
    const client = renderToString(<BulkPublishingNewSchedule />);
    const start = (html: string) => html.match(/Starts<\/span><span[^>]+>.*?<\/span>/)?.[0];
    expect(start(server)).toBeTruthy();
    expect(start(client)).toBe(start(server));
    expect(server).toContain("Custom UTC schedule");
  });
});
