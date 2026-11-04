import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFinancialTable } from "./use-financial-table";

vi.mock("@/components/dashboard/workspace-apify-connection-context", () => ({
  useWorkspaceApifyConnection: () => ({ workspaceId: "bp1" }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const details = {
  workspaceId: "bp1",
  snapshotId: "original",
  query: "from=2026-08-10&to=2026-08-11&table=daily",
};

describe("financial report details", () => {
  it("reuses an expired snapshot's replacement for subsequent pagination", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(
          JSON.stringify({
            data: {
              items: [{ key: "row" }],
              total: 100,
              page: 1,
              pageSize: 25,
              snapshotId: "replacement",
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(
      ({ page }) => useFinancialTable("costs", details, "", page, 25, "direct", "desc"),
      { initialProps: { page: 1 } },
    );
    await waitFor(() => expect(result.current.data?.snapshotId).toBe("replacement"));
    rerender({ page: 2 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]![0])).toContain("snapshotId=replacement");
  });

  it("exports every filtered page and pins requests to the selected workspace", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const params = new URL(String(input), "https://actorconsole.com").searchParams;
      const page = Number(params.get("page"));
      const size = Number(params.get("pageSize"));
      const length = size === 500 ? (page === 1 ? 500 : 1) : 25;
      return new Response(
        JSON.stringify({
          data: {
            items: Array.from({ length }, (_, index) => ({
              key: `${page}:${index}`,
              actorId: `actor-${index}`,
            })),
            total: 501,
            page,
            pageSize: size,
            snapshotId: "reused",
          },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useFinancialTable("costs", details, "maps", 1, 25, "direct", "desc"),
    );
    await waitFor(() => expect(result.current.data?.total).toBe(501));
    let rows: unknown[] = [];
    await act(async () => {
      rows = await result.current.allRows();
    });
    expect(rows).toHaveLength(501);
    const exports = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("pageSize=500"),
    );
    expect(exports).toHaveLength(2);
    expect(String(exports[0]![0])).toContain("snapshotId=reused");
    expect(String(exports[1]![0])).toContain("snapshotId=reused");
    expect(String(exports[1]![0])).toContain("q=maps");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { "x-business-profile-id": "bp1" } }),
    );
  });

  it("discards an older table response after moving to another page", async () => {
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              items: [{ key: "new" }],
              total: 50,
              page: 2,
              pageSize: 25,
              snapshotId: "original",
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(
      ({ page }) => useFinancialTable("usage", details, "", page, 25, "runs", "desc"),
      { initialProps: { page: 1 } },
    );
    rerender({ page: 2 });
    await waitFor(() => expect(result.current.data?.page).toBe(2));
    await act(async () =>
      resolveFirst(
        new Response(JSON.stringify({ data: { items: [{ key: "old" }], total: 50, page: 1 } })),
      ),
    );
    expect(result.current.data?.items[0]?.key).toBe("new");
  });
});
