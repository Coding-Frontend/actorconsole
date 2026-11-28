import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkLogoReview } from "./bulk-logo-review";
import { WORKSPACE_CHANGED_EVENT } from "./onboarding-gate";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { logoReviewTiming, type LogoReviewItem } from "@/lib/logo-review";

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));
let records: LogoReviewItem[];
let workspaceId: string;
let fetchMock: ReturnType<typeof vi.fn>;
type FakeBatch = {
  id: string;
  status: string;
  total: number;
  queue: string[];
  done: Array<{ id: string; outcome: "applied" | "failed"; message?: string; retryable: boolean }>;
};
/** A stand-in for the background worker: each progress poll applies one logo. */
let batches: Map<string, FakeBatch>;
let failApply: Set<string>;
let holdAfterFirst: boolean;
const fixture = (id: number, title = `Actor ${id}`): LogoReviewItem => ({
  id: `r${id}`,
  status: "PENDING",
  error: null,
  appliedAt: null,
  dismissedAt: null,
  proposedImageUrl: `/api/website-logo-assets/l${id}`,
  actor: {
    id: `a${id}`,
    apifyActorId: `ap${id}`,
    title,
    actorName: `actor-${id}`,
    username: "searchapi",
    currentImageUrl: null,
  },
  logo: {
    websiteIdentity: {
      id: `w${id % 2}`,
      name: id % 2 ? "Maps" : "ClinicalTrials",
      canonicalDomain: id % 2 ? "maps.google.com" : "clinicaltrials.gov",
    },
  },
});
const response = (data: unknown) => new Response(JSON.stringify({ ok: true, data }));
function filtered(params: URLSearchParams) {
  const query = params.get("q")?.toLowerCase();
  return records.filter(
    (item) =>
      (!query ||
        `${item.actor.title} ${item.actor.actorName} ${item.logo.websiteIdentity.name}`
          .toLowerCase()
          .includes(query)) &&
      (!params.get("websiteId") || item.logo.websiteIdentity.id === params.get("websiteId")) &&
      (params.get("thumbnail") !== "missing" || !item.actor.currentImageUrl) &&
      (params.get("thumbnail") !== "existing" || Boolean(item.actor.currentImageUrl)),
  );
}
function batchView(batch: FakeBatch) {
  const actor = (id: string) => {
    const record = records.find((row) => row.id === id)!;
    return { id: record.actor.id, title: record.actor.title, actorName: record.actor.actorName };
  };
  return {
    id: batch.id,
    status: batch.status,
    total: batch.total,
    stopRequested: false,
    error: null,
    workspaceId,
    items: [
      ...batch.done.map((item) => ({ ...item, actor: actor(item.id) })),
      ...batch.queue.map((id) => ({ id, actor: actor(id), outcome: "queued", retryable: false })),
    ],
  };
}
function step(batch: FakeBatch) {
  const id = batch.queue.shift();
  if (id) {
    const record = records.find((row) => row.id === id)!;
    if (failApply.has(id)) {
      record.status = "PENDING";
      batch.done.push({ id, outcome: "failed", message: "Apify rejected this logo", retryable: true });
    } else {
      record.status = "APPLIED";
      record.actor.currentImageUrl = `https://images.apify.com/${id}.webp`;
      batch.done.push({ id, outcome: "applied", retryable: false });
    }
  }
  if (!batch.queue.length && batch.status === "RUNNING") batch.status = "COMPLETED";
}
async function handle(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(String(input), "http://localhost");
  if (url.pathname.endsWith("/batches/active")) {
    const active = [...batches.values()].find((batch) => batch.status === "RUNNING");
    return response({ batch: active ? batchView(active) : null, workspaceId });
  }
  const batchMatch = /\/batches\/([^/]+)(\/stop)?$/.exec(url.pathname);
  if (batchMatch) {
    const batch = batches.get(batchMatch[1]!)!;
    if (batchMatch[2]) {
      for (const id of batch.queue) records.find((row) => row.id === id)!.status = "PENDING";
      batch.queue = [];
      batch.status = "STOPPED";
    } else if (!holdAfterFirst) step(batch);
    return response(batchView(batch));
  }
  if (init?.method === "POST" && url.pathname.endsWith("/batches")) {
    const ids = JSON.parse(String(init.body)).ids as string[];
    const batch: FakeBatch = {
      id: `b${batches.size + 1}`,
      status: "RUNNING",
      total: ids.length,
      queue: [...ids],
      done: [],
    };
    for (const id of ids) records.find((row) => row.id === id)!.status = "QUEUED" as never;
    batches.set(batch.id, batch);
    if (holdAfterFirst) step(batch);
    return new Response(JSON.stringify({ ok: true, data: batchView(batch) }), { status: 202 });
  }
  if (init?.method === "POST" && url.pathname.endsWith("/dismiss")) {
    const ids = JSON.parse(String(init.body)).ids as string[];
    for (const id of ids) records.find((row) => row.id === id)!.status = "DISMISSED";
    return response({ dismissed: ids });
  }
  const matching = filtered(url.searchParams);
  if (url.pathname.endsWith("/selection")) {
    const pending = matching.filter((item) => item.status === "PENDING");
    const after = url.searchParams.get("after");
    const index = after ? pending.findIndex((item) => item.id === after) + 1 : 0;
    const items = pending.slice(index, index + 5);
    return response({
      items,
      workspaceId,
      nextCursor: index + 5 < pending.length ? items.at(-1)!.id : null,
    });
  }
  const status = url.searchParams.get("status") ?? "PENDING";
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 10);
  const items = matching.filter((item) => item.status === status);
  return response({
    items: items.slice((page - 1) * limit, page * limit),
    total: items.length,
    page,
    limit,
    workspaceId,
    summary: {
      counts: {
        PENDING: matching.filter((item) => item.status === "PENDING").length,
        APPLIED: matching.filter((item) => item.status === "APPLIED").length,
        DISMISSED: matching.filter((item) => item.status === "DISMISSED").length,
      },
      websites: [fixture(1).logo.websiteIdentity, fixture(2).logo.websiteIdentity],
    },
  });
}
beforeEach(() => {
  records = [fixture(1, "Maps Actor"), fixture(2, "Clinic Actor"), fixture(3, "Reddit Actor")];
  workspaceId = "workspace-1";
  batches = new Map();
  failApply = new Set();
  holdAfterFirst = false;
  logoReviewTiming.pollMs = 1;
  fetchMock = vi.fn(handle);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function select(title: string) {
  fireEvent.click(await screen.findByRole("checkbox", { name: `Select ${title} for logo review` }));
}
async function confirmAction(action: "apply" | "dismiss", count: number) {
  const footer = screen.getByRole("region", { name: "Bulk logo actions" });
  fireEvent.click(
    within(footer).getByRole("button", {
      name:
        action === "apply"
          ? `Apply ${count} logo${count === 1 ? "" : "s"} to Apify`
          : "Dismiss selected",
    }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("list", { name: "Actors in this bulk action" }).children,
  ).toHaveLength(count);
  fireEvent.click(
    within(dialog).getByRole("button", {
      name:
        action === "apply"
          ? `Apply ${count} logo${count === 1 ? "" : "s"}`
          : `Dismiss ${count} selected`,
    }),
  );
}

describe("BulkLogoReview", () => {
  it("compares current and proposed thumbnails and enlarges them without a mutation", async () => {
    records[0]!.actor.currentImageUrl = "https://images.apify.com/original.webp";
    render(<BulkLogoReview />);
    await screen.findByRole("table", { name: "Actor logo comparisons" });
    expect(screen.getByAltText("Maps Actor Apify thumbnail").getAttribute("src")).toBe(
      "https://images.apify.com/original.webp",
    );
    expect(screen.getByAltText("Maps Actor proposed logo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enlarge proposed logo for Maps Actor" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByAltText("Proposed website logo")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it.each(["apply", "dismiss"] as const)(
    "confirms and bulk %s only the selected Actors, then refreshes data",
    async (action) => {
      const refreshed = vi.fn();
      window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refreshed);
      render(<BulkLogoReview />);
      await select("Maps Actor");
      await select("Clinic Actor");
      await confirmAction(action, 2);
      await screen.findByText("Bulk review complete");
      await waitFor(() =>
        expect(
          records.filter((item) => item.status === (action === "apply" ? "APPLIED" : "DISMISSED")),
        ).toHaveLength(2),
      );
      expect(records[2]?.status).toBe("PENDING");
      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
      expect(posts.map(([url]) => url)).toEqual([
        expect.stringMatching(action === "apply" ? /\/batches$/ : /\/dismiss$/),
      ]);
      expect(JSON.parse(String(posts[0]![1].body))).toEqual({ ids: ["r1", "r2"] });
      expect(refreshed).toHaveBeenCalledTimes(1);
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`^${action === "apply" ? "Applied" : "Dismissed"}`),
        }),
      );
      await screen.findByRole("link", { name: "Maps Actor" });
      expect(screen.getByRole("link", { name: "Clinic Actor" })).toBeTruthy();
      window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refreshed);
    },
  );

  it("selects all matching Actors across cursor pages, preserves selection on pagination and clears it on a filter change", async () => {
    records = Array.from({ length: 11 }, (_, index) => fixture(index + 1));
    render(<BulkLogoReview />);
    fireEvent.click(await screen.findByRole("button", { name: "Select all 11 matching" }));
    await screen.findByText("11 Actors selected");
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/selection?")),
    ).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Next logo page" }));
    const last = await screen.findByRole("checkbox", { name: "Select Actor 11 for logo review" });
    expect((last as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("11 Actors selected")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Website" }), {
      target: { value: "w1" },
    });
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Bulk logo actions" })).toBeNull(),
    );
    expect(screen.getByText("0 selected")).toBeTruthy();
  });

  it("retains failed Actors for an explicit retry while leaving successful Actors completed", async () => {
    failApply.add("r2");
    render(<BulkLogoReview />);
    await select("Maps Actor");
    await select("Clinic Actor");
    await confirmAction("apply", 2);
    await screen.findByText("Bulk review complete");
    expect(screen.getByText("2 of 2 processed · 1 applied · 1 failed")).toBeTruthy();
    expect(records[0]?.status).toBe("APPLIED");
    expect(records[1]?.status).toBe("PENDING");
    expect(await screen.findByText("1 Actor selected")).toBeTruthy();
    expect(screen.getByText("Apify rejected this logo")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("stops the background batch after the current Actor and does not apply the rest", async () => {
    holdAfterFirst = true;
    render(<BulkLogoReview />);
    await select("Maps Actor");
    await select("Clinic Actor");
    await confirmAction("apply", 2);
    expect(
      await screen.findByText("Logos keep applying in the background if you leave this page.", {
        exact: false,
      }),
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Stop after current" }));
    await screen.findByText("Bulk review stopped");
    expect(
      screen.getByText("1 of 2 processed · 1 applied · 0 failed · 1 not started"),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => url),
    ).toEqual([expect.stringMatching(/\/batches$/), expect.stringMatching(/\/batches\/b1\/stop$/)]);
    expect(records[1]?.status).toBe("PENDING");
  });

  it("picks up a bulk apply that is still running when the page is reopened", async () => {
    records[0]!.status = "QUEUED" as never;
    batches.set("b1", { id: "b1", status: "RUNNING", total: 1, queue: ["r1"], done: [] });
    render(<BulkLogoReview />);
    await screen.findByText("Bulk review complete");
    expect(screen.getByText("1 of 1 processed · 1 applied · 0 failed")).toBeTruthy();
    expect(records[0]?.status).toBe("APPLIED");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("aborts an old workspace batch, ignores a late response and pins every submitted request to its original workspace", async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockImplementation(async (input, init) =>
      init?.method === "POST"
        ? new Promise<Response>((resolve) => {
            complete = resolve;
          })
        : handle(input, init),
    );
    render(<BulkLogoReview />);
    await select("Maps Actor");
    await select("Clinic Actor");
    await confirmAction("apply", 2);
    await screen.findByRole("button", { name: "Stop after current" });
    const mutation = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(mutation[1].headers.get("x-business-profile-id")).toBe("workspace-1");
    workspaceId = "workspace-2";
    records = [fixture(4, "New workspace Actor")];
    fireEvent(window, new Event(WORKSPACE_CHANGED_EVENT));
    await screen.findByRole("link", { name: "New workspace Actor" });
    await act(async () => complete(response({ pictureUrl: "https://images.apify.com/old.webp" })));
    expect(mutation[1].signal.aborted).toBe(true);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Bulk logo actions" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Bulk logo results" })).toBeNull();
  });

  it("searches and filters on the server, clears selections, and renders a recoverable loading error", async () => {
    render(<BulkLogoReview />);
    await select("Maps Actor");
    fireEvent.change(screen.getByRole("textbox", { name: "Search Actors or websites" }), {
      target: { value: "Clinic" },
    });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("q=Clinic"))).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole("link", { name: "Maps Actor" })).toBeNull());
    expect(screen.getByRole("link", { name: "Clinic Actor" })).toBeTruthy();
    fetchMock.mockRejectedValueOnce(new Error("Temporary API failure"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh logo reviews" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("link", { name: "Clinic Actor" });
  });

  it("clears selection when a refreshed response reveals that the workspace changed outside this tab", async () => {
    render(<BulkLogoReview />);
    await select("Maps Actor");
    workspaceId = "workspace-2";
    records = [fixture(4, "Another workspace Actor")];
    fireEvent.click(screen.getByRole("button", { name: "Refresh logo reviews" }));
    await screen.findByRole("link", { name: "Another workspace Actor" });
    expect(screen.queryByRole("region", { name: "Bulk logo actions" })).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });
});
