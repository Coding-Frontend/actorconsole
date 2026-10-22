import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BulkPublishingWorkspace } from "./bulk-publishing-workspace";
import { PUBLISHING_SELECTION_KEY, type ActorItem } from "./bulk-publishing-types";

function response(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

describe("BulkPublishingWorkspace", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([true, null])(
    "renders default-build readiness %s without false missing badges",
    async (publishReady) => {
      const actor: ActorItem = {
        id: "actor_1",
        apifyActorId: "apify_1",
        username: "owner",
        actorName: "actor",
        title: "Build verified Actor",
        currentImageUrl: null,
        storeIsPublic: true,
        storeIsDeprecated: false,
        storeNotice: "NONE",
        storeStatusSyncedAt: new Date().toISOString(),
        publishReady,
        hasDescription: true,
        hasReadme: publishReady,
        hasInputSchema: publishReady,
        hasOutputSchema: publishReady,
        hasKeyValueSchema: null,
        readinessSyncedAt: new Date().toISOString(),
      };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() =>
          response({
            ok: true,
            data: { items: [actor], total: 1, page: 1, limit: 25 },
          }),
        ),
      );
      render(<BulkPublishingWorkspace />);
      await screen.findAllByText("Build verified Actor");
      expect(
        screen.getAllByText(publishReady ? "Ready" : "Not fully checked").length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText("README")).toBeNull();
      expect(screen.queryByText("Input schema")).toBeNull();
      expect(screen.queryByText("Output schema")).toBeNull();
      if (publishReady === null) expect(screen.queryByText("Ready")).toBeNull();
    },
  );

  it("renders cached inventory without automatically starting a remote refresh", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      response({
        ok: true,
        data: { items: [], total: 0, page: 1, limit: 25 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BulkPublishingWorkspace />);

    await waitFor(() => expect(screen.getByText("No Actors match this view")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("refresh=1");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it("keeps the inventory filter rail outside an overflow-clipping ancestor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        response({
          ok: true,
          data: { items: [], total: 0, page: 1, limit: 25 },
        }),
      ),
    );

    render(<BulkPublishingWorkspace />);

    await waitFor(() => expect(screen.getByText("No Actors match this view")).toBeTruthy());
    const inventorySection = screen
      .getByRole("heading", { name: "Actor inventory" })
      .closest("section");
    const filterRail = document.querySelector(".dashboard-filter-rail");

    expect(inventorySection?.className).toContain("overflow-visible");
    expect(inventorySection?.className).not.toContain("overflow-hidden");
    expect(filterRail).toBeTruthy();
  });

  it("shows visibility and lifecycle flags together instead of hiding overlapping states", async () => {
    const privateDeprecatedActor: ActorItem = {
      id: "actor_private",
      apifyActorId: "apify_private",
      username: "owner",
      actorName: "private-actor",
      title: "Private deprecated Actor",
      currentImageUrl: null,
      storeIsPublic: false,
      storeIsDeprecated: true,
      storeNotice: "UNDER_MAINTENANCE",
      storeStatusSyncedAt: new Date().toISOString(),
      publishReady: false,
      hasDescription: true,
      hasReadme: true,
      hasInputSchema: true,
      hasOutputSchema: true,
      hasKeyValueSchema: true,
      readinessSyncedAt: new Date().toISOString(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        response({
          ok: true,
          data: { items: [privateDeprecatedActor], total: 1, page: 1, limit: 25 },
        }),
      ),
    );

    render(<BulkPublishingWorkspace />);

    expect((await screen.findAllByText("Private")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Maintenance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Deprecated").length).toBeGreaterThan(0);
  });

  it("queues and polls an explicit inventory refresh while cached rows stay available", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/bulk-publishing/inventory/refresh") && init?.method === "POST") {
        return response({ ok: true, data: { jobId: "job_1", state: "queued" } }, 202);
      }
      if (url.endsWith("/bulk-publishing/inventory/refresh/job_1")) {
        return response({
          ok: true,
          data: {
            jobId: "job_1",
            state: "completed",
            progress: { total: 1, completed: 1 },
            result: { importedActors: 1 },
          },
        });
      }
      return response({
        ok: true,
        data: { items: [], total: 0, page: 1, limit: 25 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BulkPublishingWorkspace />);
    await waitFor(() => expect(screen.getByText("No Actors match this view")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Apify" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/bulk-publishing/inventory/refresh"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith("/inventory/refresh/job_1")),
      ).toBe(true),
    );
  });

  it("does not restore a stale inventory selection after refresh and exposes a clear action", async () => {
    const actor: ActorItem = {
      id: "actor_1",
      apifyActorId: "apify_1",
      username: "owner",
      actorName: "sample-actor",
      title: "Sample Actor",
      currentImageUrl: null,
      storeIsPublic: false,
      storeIsDeprecated: false,
      storeNotice: null,
      storeStatusSyncedAt: null,
      publishReady: true,
      hasDescription: true,
      hasReadme: true,
      hasInputSchema: true,
      hasOutputSchema: true,
      hasKeyValueSchema: true,
      readinessSyncedAt: new Date().toISOString(),
    };
    window.sessionStorage.setItem(PUBLISHING_SELECTION_KEY, JSON.stringify([actor]));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        response({
          ok: true,
          data: { items: [actor], total: 1, page: 1, limit: 25 },
        }),
      ),
    );

    render(<BulkPublishingWorkspace />);

    const actorCheckboxes = await screen.findAllByRole("checkbox", { name: "Select Sample Actor" });
    expect(actorCheckboxes.every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true);
    await waitFor(() => expect(window.sessionStorage.getItem(PUBLISHING_SELECTION_KEY)).toBe("[]"));

    fireEvent.click(actorCheckboxes[0]!);
    const clearSelection = (await screen.findAllByRole("button", { name: "Clear selection" }))[0];
    expect(clearSelection).toBeTruthy();
    fireEvent.click(clearSelection!);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("checkbox", { name: "Select Sample Actor" })
          .every((checkbox) => !(checkbox as HTMLInputElement).checked),
      ).toBe(true),
    );
  });

  it("clears the inventory selection when the workspace changes", async () => {
    const actor = {
      id: "actor_1",
      apifyActorId: "apify_1",
      username: "owner",
      actorName: "sample-actor",
      title: "Sample Actor",
      currentImageUrl: null,
      storeIsPublic: false,
      storeIsDeprecated: false,
      storeNotice: null,
      storeStatusSyncedAt: null,
      publishReady: null,
      hasDescription: null,
      hasReadme: null,
      hasInputSchema: null,
      hasOutputSchema: null,
      hasKeyValueSchema: null,
      readinessSyncedAt: null,
    } satisfies ActorItem;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          response({ ok: true, data: { items: [actor], total: 1, page: 1, limit: 25 } }),
        ),
    );

    render(<BulkPublishingWorkspace />);
    const actorCheckbox = (
      await screen.findAllByRole("checkbox", {
        name: "Select Sample Actor",
      })
    )[0]!;
    fireEvent.click(actorCheckbox);
    expect(await screen.findByText("1 Actor selected")).toBeTruthy();

    window.dispatchEvent(new Event("actorconsole:workspace-changed"));

    await waitFor(() => expect(screen.queryByText("1 Actor selected")).toBeNull());
    expect(window.sessionStorage.getItem(PUBLISHING_SELECTION_KEY)).toBe("[]");
  });
});
