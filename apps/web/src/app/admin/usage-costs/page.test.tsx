import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { adminApi } = vi.hoisted(() => ({ adminApi: vi.fn() }));

vi.mock("@/lib/admin/api", () => ({ api: (...args: unknown[]) => adminApi(...args) }));

import UsageCostsPage from "./page";

describe("Admin usage costs", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("maps every row to the correct column and supports Actor search", async () => {
    adminApi.mockImplementation(async (path: string) => {
      if (path.endsWith("/summary")) {
        return {
          ok: true,
          data: {
            totalUsageCostUsd: 1.25,
            totalRuns: 9,
            avgDailyUsageCostUsd: 1.25,
            daysWithData: 1,
          },
        };
      }
      return {
        ok: true,
        data: {
          total: 1,
          items: [
            {
              id: "usage_1",
              actorId: "actor_1",
              date: "2026-08-18",
              usageCostUsd: 1.25,
              runs: 9,
              adjustmentUsd: 0.1,
              actor: {
                actorName: "maps-scraper",
                apifyActorId: "builder/maps-scraper",
              },
            },
          ],
        },
      };
    });

    render(<UsageCostsPage />);

    const actorName = await screen.findByText("maps-scraper");
    const row = actorName.closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row!).getAllByRole("cell");
    expect(cells).toHaveLength(6);
    expect(cells[0].textContent).toContain("2026-08-18");
    expect(cells[1].textContent).toContain("maps-scraper");
    expect(cells[2].textContent).toContain("$1.25");
    expect(cells[3].textContent).toBe("9");
    expect(cells[4].textContent).toContain("$0.10");
    expect(within(cells[5]).getByRole("link", { name: "Open" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search usage costs by Actor"), {
      target: { value: "maps" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(adminApi).toHaveBeenCalledWith(
        "/admin/usage-costs",
        expect.objectContaining({ params: expect.objectContaining({ search: "maps" }) }),
      ),
    );
    expect(adminApi).toHaveBeenCalledWith(
      "/admin/usage-costs/summary",
      expect.objectContaining({ params: expect.objectContaining({ search: "maps" }) }),
    );
  });

  it("retains the table while filtering and ignores an older response that finishes last", async () => {
    const finishOld: Array<() => void> = [];
    function response(path: string, name: string) {
      return {
        ok: true,
        data: path.endsWith("/summary")
          ? { totalUsageCostUsd: 1.25, totalRuns: 9, avgDailyUsageCostUsd: 1.25, daysWithData: 1 }
          : {
              total: 1,
              items: [
                {
                  id: name,
                  actorId: name,
                  date: "2026-10-07",
                  usageCostUsd: 1.25,
                  runs: 9,
                  actor: { actorName: name },
                },
              ],
            },
      };
    }
    adminApi.mockImplementation((path: string, options?: { params?: { search?: string } }) => {
      const name = options?.params?.search ?? "Initial actor";
      if (name === "Old actor")
        return new Promise((resolve) => finishOld.push(() => resolve(response(path, name))));
      return Promise.resolve(response(path, name));
    });
    render(<UsageCostsPage />);
    await screen.findByText("Initial actor");
    const table = screen.getByRole("table");
    const search = screen.getByLabelText("Search usage costs by Actor");
    fireEvent.change(search, { target: { value: "Old actor" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(finishOld).toHaveLength(2));
    expect(screen.getByRole("table")).toBe(table);
    expect(screen.getByText("Initial actor")).toBeTruthy();
    expect(screen.getByText("Updating results…")).toBeTruthy();
    fireEvent.change(search, { target: { value: "Latest actor" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Latest actor");
    expect(screen.getByRole("table")).toBe(table);
    await act(async () => finishOld.forEach((finish) => finish()));
    expect(screen.queryByText("Old actor")).toBeNull();
    expect(screen.getByText("Latest actor")).toBeTruthy();
    expect(screen.queryByText("Updating results…")).toBeNull();
  });
});
