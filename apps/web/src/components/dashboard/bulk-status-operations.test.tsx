import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BulkStatusOperations } from "./bulk-status-operations";

function response(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

describe("BulkStatusOperations", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders immediate operation history without recurring schedule metadata", async () => {
    const operation = {
      id: "operation_1",
      action: "CLEAR_MAINTENANCE",
      status: "PARTIAL",
      jobId: "job_1",
      underMaintenance: false,
      isDeprecated: false,
      actorCount: 2,
      completedCount: 2,
      succeededCount: 1,
      failedCount: 1,
      error: null,
      startedAt: "2026-09-01T01:00:00.000Z",
      completedAt: "2026-09-01T01:01:00.000Z",
      createdAt: "2026-09-01T01:00:00.000Z",
      updatedAt: "2026-09-01T01:01:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/status-operations/operation_1")) {
          return response({
            ok: true,
            data: {
              ...operation,
              items: [
                {
                  id: "item_1",
                  actorId: "actor_1",
                  apifyActorId: "owner~actor",
                  label: "Example Actor",
                  position: 0,
                  status: "SUCCEEDED",
                  error: null,
                  startedAt: operation.startedAt,
                  completedAt: operation.completedAt,
                },
              ],
            },
          });
        }
        return response({
          ok: true,
          data: { items: [operation], page: 1, limit: 20, total: 1, totalPages: 1 },
        });
      }),
    );

    render(<BulkStatusOperations />);

    await waitFor(() =>
      expect(screen.getByText("Clear maintenance and deprecated status")).toBeTruthy(),
    );
    expect(screen.queryByText("Last run")).toBeNull();
    expect(screen.queryByText("Recent runs")).toBeNull();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    await waitFor(() => expect(screen.getByText("Example Actor")).toBeTruthy());
  });
});
