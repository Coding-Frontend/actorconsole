import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { adminApi } = vi.hoisted(() => ({ adminApi: vi.fn() }));
vi.mock("@/lib/admin/api", () => ({ api: (...args: unknown[]) => adminApi(...args) }));

import { AdminActorsTable } from "./actors-table";

describe("AdminActorsTable", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("filters, sorts, paginates, and exposes row actions", async () => {
    adminApi.mockResolvedValue({
      ok: true,
      data: {
        total: 1,
        items: [
          {
            id: "actor_1",
            actorName: "maps-scraper",
            username: "builder",
            title: "Maps Scraper",
            storeIsPublic: false,
            storeIsDeprecated: false,
            storeNotice: null,
            publishReady: true,
            updatedAt: "2026-08-18T00:00:00.000Z",
            user: { name: "Builder", email: "builder@example.com" },
          },
        ],
      },
    });

    render(<AdminActorsTable />);

    expect(await screen.findByText("Maps Scraper")).toBeTruthy();
    expect(screen.getAllByText("Private")).toHaveLength(2);
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open maps-scraper" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View maps-scraper on Apify" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Store visibility"), {
      target: { value: "PRIVATE" },
    });
    fireEvent.change(screen.getByLabelText("Deprecation status"), {
      target: { value: "false" },
    });
    fireEvent.change(screen.getByLabelText("Sort Actors"), {
      target: { value: "actorName:asc" },
    });
    fireEvent.change(screen.getByLabelText("Items per page"), {
      target: { value: "25" },
    });

    await waitFor(() =>
      expect(adminApi).toHaveBeenLastCalledWith("/admin/actors", {
        params: expect.objectContaining({
          visibility: "PRIVATE",
          deprecated: "false",
          sort: "actorName",
          order: "asc",
          limit: 25,
        }),
      }),
    );
    expect(window.location.search).toContain("visibility=PRIVATE");
    expect(window.location.search).toContain("sort=actorName");
  });

  it("uses server-provided query state for the first request", async () => {
    adminApi.mockResolvedValue({ ok: true, data: { total: 0, items: [] } });

    render(
      <AdminActorsTable
        initialParams={{
          q: "maps",
          visibility: "PUBLIC",
          deprecated: "false",
          sort: "actorName",
          order: "asc",
          page: "2",
          limit: "25",
        }}
      />,
    );

    await waitFor(() =>
      expect(adminApi).toHaveBeenCalledWith("/admin/actors", {
        params: {
          search: "maps",
          page: 2,
          limit: 25,
          visibility: "PUBLIC",
          deprecated: "false",
          publishReady: undefined,
          sort: "actorName",
          order: "asc",
        },
      }),
    );
  });
});
