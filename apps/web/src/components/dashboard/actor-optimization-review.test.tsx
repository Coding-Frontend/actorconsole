import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastSuccess, toastError, toastWarning } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError, warning: toastWarning } }));

import { ActorOptimizationReview } from "./actor-optimization-review";

const run = {
  id: "run_1",
  kind: "REWRITE_COPY",
  requestedFields: ["title", "description"],
  status: "READY_FOR_APPROVAL",
  totalCount: 1,
  completedCount: 1,
  failedCount: 0,
  appliedCount: 0,
  results: [
    {
      id: "result_1",
      status: "READY_FOR_APPROVAL",
      currentState: {
        title: "Old title",
        description: "Old description",
        readme: "Old README",
      },
      proposedState: {
        title: "Better title",
        description: "Better description",
        readme: "# Better README",
      },
      currentScore: 40,
      proposedScore: 80,
      improvementPoints: 40,
      improvementPercent: 100,
      issues: { summary: "The listing can be clearer." },
      approvedFields: null,
      error: null,
      actor: {
        id: "actor_1",
        apifyActorId: "owner~actor",
        username: "owner",
        actorName: "actor",
        title: "Old title",
      },
    },
  ],
};

describe("ActorOptimizationReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, data: run }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, data: { queued: 1 } }), { status: 202 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: true,
              data: {
                ...run,
                status: "APPLYING",
                results: [{ ...run.results[0], status: "APPROVED" }],
              },
            }),
            { status: 200 },
          ),
        ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requires explicit field approval and submits only checked fields", async () => {
    render(<ActorOptimizationReview runId="run_1" />);

    await screen.findByText("The listing can be clearer.");
    const checkboxes = screen.getAllByRole("checkbox", { name: "Include this change" });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "Review selected changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to Apify" }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Approved changes are being applied to Apify"),
    );
    const fetchMock = vi.mocked(fetch);
    const approvalCall = fetchMock.mock.calls[1];
    expect(JSON.parse(String((approvalCall[1] as RequestInit).body))).toEqual({
      items: [{ resultId: "result_1", fields: ["title", "description"] }],
    });
  });

  it("shows completed results without a generation spinner", async () => {
    vi.mocked(fetch).mockReset().mockResolvedValue(Response.json({ data: {
      ...run, status: "APPLIED", results: [{ ...run.results[0], status: "APPLIED" }],
    } }));
    render(<ActorOptimizationReview runId="run_1" />);
    await screen.findByText("Approved fields were applied to Apify.");
    expect(screen.queryByText("Generating the proposal…")).toBeNull();
  });

  it.each([
    ["APPROVED", "Approved changes are queued for application."],
    ["APPLYING", "Applying approved fields to Apify…"],
  ])("shows the actual %s operation", async (status, message) => {
    vi.mocked(fetch).mockReset().mockResolvedValue(Response.json({ data: {
      ...run, status: "APPLYING", results: [{ ...run.results[0], status }],
    } }));
    render(<ActorOptimizationReview runId="run_1" />);
    await screen.findByText(message);
    expect(screen.queryByText("Generating the proposal…")).toBeNull();
  });

  it.each([
    [0, "No changes were queued. 1 Actor could not be queued."],
    [1, "Changes queued for 1 Actor; 1 Actor could not be queued."],
  ])("reports enqueue failures truthfully when %s changes were queued", async (queued, message) => {
    vi.mocked(fetch).mockReset()
      .mockResolvedValueOnce(Response.json({ data: run }))
      .mockResolvedValueOnce(Response.json({ data: { queued, failed: 1 } }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ data: run }));
    render(<ActorOptimizationReview runId="run_1" />);
    await screen.findByText("The listing can be clearer.");
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Include this change" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Review selected changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to Apify" }));
    await waitFor(() => expect(queued ? toastWarning : toastError).toHaveBeenCalledWith(message));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("catches a failed recheck request and restores its control", async () => {
    vi.mocked(fetch).mockReset()
      .mockResolvedValueOnce(Response.json({ data: {
        ...run, results: [{ ...run.results[0], status: "STALE", error: "Metadata changed" }],
      } }))
      .mockRejectedValueOnce(new Error("Connection lost"));
    render(<ActorOptimizationReview runId="run_1" />);
    const button = await screen.findByRole("button", { name: "Recheck Actor" });
    fireEvent.click(button);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Connection lost"));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("bulk selects and clears the same field across every eligible Actor", async () => {
    const bulkRun = {
      ...run,
      totalCount: 2,
      completedCount: 2,
      requestedFields: ["title", "description"],
      results: [
        run.results[0],
        {
          ...run.results[0],
          id: "result_2",
          actor: {
            ...run.results[0].actor,
            id: "actor_2",
            apifyActorId: "owner~second-actor",
            actorName: "second-actor",
            title: "Second Actor",
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, data: bulkRun }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, data: { queued: 2 } }), { status: 202 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, data: bulkRun }), { status: 200 }),
        ),
    );

    render(<ActorOptimizationReview runId="run_1" />);

    await screen.findByText("Second Actor");
    fireEvent.click(screen.getByRole("button", { name: "Select fields across Actors" }));

    const bulkTitle = screen.getByRole("checkbox", {
      name: "Select Title for all eligible Actors",
    });
    const bulkDescription = screen.getByRole("checkbox", {
      name: "Select Description for all eligible Actors",
    });
    expect((bulkTitle as HTMLInputElement).checked).toBe(false);
    expect((bulkDescription as HTMLInputElement).checked).toBe(false);

    fireEvent.click(bulkTitle);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      (screen.getAllByRole("checkbox", { name: "Include this change" })[0] as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getAllByRole("checkbox", { name: "Include this change" })[2] as HTMLInputElement)
        .checked,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Select fields across Actors" }));
    const reopenedBulkTitle = screen.getByRole("checkbox", {
      name: "Select Title for all eligible Actors",
    });
    const reopenedBulkDescription = screen.getByRole("checkbox", {
      name: "Select Description for all eligible Actors",
    });
    fireEvent.click(reopenedBulkTitle);
    fireEvent.click(reopenedBulkDescription);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Review selected changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to Apify" }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3));
    const approvalCall = vi.mocked(fetch).mock.calls[1];
    expect(JSON.parse(String((approvalCall[1] as RequestInit).body))).toEqual({
      items: [
        { resultId: "result_1", fields: ["description"] },
        { resultId: "result_2", fields: ["description"] },
      ],
    });
  }, 10_000);

  it("paginates large reviews while keeping the bulk selection count global", async () => {
    const results = Array.from({ length: 21 }, (_, index) => ({
      ...run.results[0],
      id: `result_${index + 1}`,
      actor: {
        ...run.results[0].actor,
        id: `actor_${index + 1}`,
        apifyActorId: `owner~actor-${index + 1}`,
        actorName: `actor-${index + 1}`,
        title: `Actor ${index + 1}`,
      },
    }));
    const pagedRun = {
      ...run,
      totalCount: results.length,
      completedCount: results.length,
      requestedFields: ["title"],
      results,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, data: pagedRun }), { status: 200 }),
        ),
    );

    render(<ActorOptimizationReview runId="run_1" />);

    await screen.findByText("Actor 20");
    expect(screen.queryByText("Actor 21")).toBeNull();
    expect(screen.getByText(/Showing 1–20 of 21 Actor proposals/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select fields across Actors" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Title for all eligible Actors" }));
    expect(screen.getByText("21 of 21 eligible Actors selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Actor 21")).toBeTruthy();
    expect(screen.queryByText("Actor 1")).toBeNull();
    expect(screen.getByText(/Showing 21–21 of 21 Actor proposals/)).toBeTruthy();
  });
});
