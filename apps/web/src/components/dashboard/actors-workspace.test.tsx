import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/actors",
}));

vi.mock("@/lib/actor-refresh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/actor-refresh")>()),
  refreshWorkspaceActors: vi.fn(),
}));

import { refreshWorkspaceActors, WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";

import { WorkspaceApifyConnectionProvider } from "./workspace-apify-connection-context";
import type { ReactNode } from "react";
function render(ui: ReactNode) {
  return rtlRender(
    <WorkspaceApifyConnectionProvider workspaceId="bp1">{ui}</WorkspaceApifyConnectionProvider>,
  );
}

import { ActorsWorkspace } from "./actors-workspace";
import { BulkLogoReview } from "./bulk-logo-review";
import { WorkspaceApifyConnectionBanner } from "./workspace-apify-connection-banner";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "./dashboard-navigation";

describe("ActorsWorkspace", () => {
  beforeEach(() => {
    vi.mocked(refreshWorkspaceActors).mockReset().mockResolvedValue("completed");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
  });

  it("shows a filtered empty state instead of claiming the API key is missing", async () => {
    window.history.replaceState(null, "", "/dashboard/actors?q=missing+actor");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/apify/status")) {
          return new Response(
            JSON.stringify({ data: { connected: false, apiKeyConfigured: false } }),
            { status: 200 },
          );
        }
        if (url.includes("/actors/dashboard-list")) {
          return new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<ActorsWorkspace initialParams={{ q: "missing actor" }} />);

    expect(await screen.findByText("No actors match these filters")).toBeTruthy();
    expect(screen.queryByText("Apify API key required")).toBeNull();
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe(
      "/dashboard/actors",
    );
  });

  it("keeps loading rows aligned with the eight-column Actor table", () => {
    window.history.replaceState(null, "", "/dashboard/actors");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    const { container } = render(<ActorsWorkspace />);

    const loadingTable = screen.getByLabelText("Loading actors").querySelector("table");
    expect(loadingTable?.querySelectorAll("thead th")).toHaveLength(8);
    expect(loadingTable?.querySelector("tbody tr")?.children).toHaveLength(8);
    expect(container.querySelector('[aria-label="Loading actors"]')).toBeTruthy();
  });

  it("offers Refresh from Apify when an API key is configured", async () => {
    window.history.replaceState(null, "", "/dashboard/actors");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/apify/status")) {
          return new Response(
            JSON.stringify({ data: { connected: true, apiKeyConfigured: true } }),
            { status: 200 },
          );
        }
        if (url.includes("/actors/dashboard-list")) {
          return new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<ActorsWorkspace />);

    expect(await screen.findByText("No actors synced yet")).toBeTruthy();
    expect(screen.getByText(/synced automatically/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Refresh from Apify" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  function mockActorList(total: () => number = () => 1278) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/apify/status")) {
        return new Response(JSON.stringify({ data: { connected: true, apiKeyConfigured: true } }));
      }
      if (url.includes("/actors/dashboard-list")) {
        return new Response(JSON.stringify({ data: { items: [], total: total() } }));
      }
      if (url.includes("/intelligence/earnings")) {
        return new Response(JSON.stringify({ data: { items: [] } }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("shares one connection request between the banner and Actors, including simultaneous invalidation events", async () => {
    const fetchMock = mockActorList();
    render(
      <>
        <WorkspaceApifyConnectionBanner workspaceId="bp1" />
        <ActorsWorkspace />
      </>,
    );
    await screen.findByText("1278 Actors matching");
    const statusCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/apify/status"));
    expect(statusCalls()).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new Event(WORKSPACE_DATA_REFRESHED_EVENT));
      window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
    });
    await waitFor(() => expect(statusCalls()).toHaveLength(2));
    expect(statusCalls()[1]![0]).toContain("/apify/status");
  });

  it("shows sync progress and reloads the count after reconciliation completes", async () => {
    let total = 1278;
    mockActorList(() => total);
    let completeSync!: () => void;
    const pending = new Promise<void>((resolve) => {
      completeSync = resolve;
    });
    vi.mocked(refreshWorkspaceActors).mockImplementation(async (options) => {
      options?.onQueued?.();
      await pending;
      total = 646;
      window.dispatchEvent(new Event(WORKSPACE_DATA_REFRESHED_EVENT));
      return "completed";
    });

    render(<ActorsWorkspace />);
    await screen.findByText("1278 Actors matching");
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Apify" }));
    expect(await screen.findByText("Syncing actors from Apify…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refreshing…" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refreshing…" }));
    expect(refreshWorkspaceActors).toHaveBeenCalledOnce();

    await act(async () => completeSync());
    expect(await screen.findByText("646 Actors matching")).toBeTruthy();
    expect(screen.getByText("Actors refreshed from Apify.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Refresh from Apify" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("shows refresh failures and allows retry", async () => {
    mockActorList();
    vi.mocked(refreshWorkspaceActors).mockResolvedValueOnce("failed");
    render(<ActorsWorkspace />);
    await screen.findByText("1278 Actors matching");
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Apify" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Refresh failed");
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Apify" }));
    expect(await screen.findByText("Actors refreshed from Apify.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refreshWorkspaceActors).toHaveBeenCalledTimes(2);
  });

  it("returns to the first page after sync while preserving search filters", async () => {
    const fetchMock = mockActorList();
    render(<ActorsWorkspace initialParams={{ q: "maps", page: "20" }} />);
    await screen.findByText("1278 Actors matching");
    await act(async () => window.dispatchEvent(new Event(WORKSPACE_DATA_REFRESHED_EVENT)));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => {
          const url = new URL(String(input), "http://localhost");
          return (
            url.pathname.includes("/actors/dashboard-list") &&
            url.searchParams.get("page") === "1" &&
            url.searchParams.get("q") === "maps"
          );
        }),
      ).toBe(true),
    );
    expect(window.location.search).toBe("?q=maps");
  });

  it("aborts pending sync polling when the workspace changes", async () => {
    mockActorList();
    vi.mocked(refreshWorkspaceActors).mockImplementation(() => new Promise(() => undefined));
    render(<ActorsWorkspace />);
    await screen.findByText("1278 Actors matching");
    fireEvent.click(screen.getByRole("button", { name: "Refresh from Apify" }));
    const signal = vi.mocked(refreshWorkspaceActors).mock.calls[0]?.[0]?.signal;
    expect(signal?.aborted).toBe(false);
    await act(async () => window.dispatchEvent(new Event("actorconsole:workspace-changed")));
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByText("Starting refresh from Apify…")).toBeNull();
  });

  it("reloads the Actor count when switching workspaces", async () => {
    let total = 1278;
    mockActorList(() => total);
    render(<ActorsWorkspace />);
    await screen.findByText("1278 Actors matching");
    total = 646;
    await act(async () => window.dispatchEvent(new Event("actorconsole:workspace-changed")));
    expect(await screen.findByText("646 Actors matching")).toBeTruthy();
    expect(screen.queryByText("1278 Actors matching")).toBeNull();
  });

  it("places the pending-logo filter inside the readiness select", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/apify/status")) {
        return new Response(JSON.stringify({ data: { connected: true, apiKeyConfigured: true } }), {
          status: 200,
        });
      }
      if (url.includes("/actors/dashboard-list")) {
        return new Response(JSON.stringify({ data: { items: [], total: 0 } }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ActorsWorkspace />);
    await screen.findByText("No actors synced yet");

    expect(screen.queryByRole("button", { name: "Pending logos" })).toBeNull();
    const readinessSelect = screen.getByRole("combobox", { name: "Filter Actor readiness" });
    expect(readinessSelect.querySelector('option[value="pending-logos"]')?.textContent).toBe(
      "Pending logos",
    );

    fireEvent.change(readinessSelect, { target: { value: "pending-logos" } });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("readiness=all&logoStatus=pending"),
        ),
      ).toBe(true),
    );
    expect(window.location.search).toBe("?logoStatus=pending");
  });

  it("renders the API-selected effective picture and an initials fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/apify/status")) {
          return new Response(
            JSON.stringify({ data: { connected: true, apiKeyConfigured: true } }),
            { status: 200 },
          );
        }
        if (url.includes("/actors/dashboard-list")) {
          return new Response(
            JSON.stringify({
              data: {
                items: [
                  {
                    id: "actor_logo",
                    username: "owner",
                    actorName: "maps-scraper",
                    apifyActorId: "apify_logo",
                    title: "Maps Scraper",
                    description: null,
                    effectivePictureUrl: "/api/website-logo-assets/logo_1",
                    pictureSource: "website",
                    snapshots: [],
                    insightSnapshots: [],
                  },
                  {
                    id: "actor_fallback",
                    username: "owner",
                    actorName: "generic-crawler",
                    apifyActorId: "apify_fallback",
                    title: "Generic Crawler",
                    description: null,
                    effectivePictureUrl: null,
                    pictureSource: "fallback",
                    snapshots: [],
                    insightSnapshots: [],
                  },
                ],
                total: 2,
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/actors/optimization/summary")) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const { container } = render(<ActorsWorkspace />);

    await screen.findAllByText("Maps Scraper");
    expect(
      container.querySelector('[data-picture-source="website"]')?.getAttribute("data-picture-url"),
    ).toBe("/api/website-logo-assets/logo_1");
    expect(screen.getAllByText("Local preview").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Local previews are website logos shown only in ActorConsole/),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-picture-source="website"]')?.getAttribute("aria-label"),
    ).toContain("not applied to Apify");
    expect(container.querySelector('[data-picture-source="fallback"]')?.textContent).toContain(
      "GC",
    );
  });

  it("replaces a local preview with the verified thumbnail immediately after applying a logo", async () => {
    let applied = false;
    const pictureUrl = "https://images.apify.com/verified.webp";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/apify/status")) {
          return new Response(
            JSON.stringify({ data: { connected: true, apiKeyConfigured: true } }),
          );
        }
        if (url.includes("/logo-recommendations/rec_1/apply") && init?.method === "POST") {
          applied = true;
          return new Response(JSON.stringify({ ok: true, data: { pictureUrl } }));
        }
        if (url.includes("/logo-recommendations")) {
          return new Response(
            JSON.stringify({
              data: {
                workspaceId: "workspace-1",
                total: applied ? 0 : 1,
                page: 1,
                limit: 10,
                summary: {
                  counts: { PENDING: applied ? 0 : 1, APPLIED: applied ? 1 : 0, DISMISSED: 0 },
                  websites: [],
                },
                items: applied
                  ? []
                  : [
                      {
                        id: "rec_1",
                        status: "PENDING",
                        error: null,
                        proposedImageUrl: "/api/website-logo-assets/logo_1",
                        actor: {
                          id: "actor_1",
                          apifyActorId: "ap_1",
                          actorName: "maps",
                          title: "Maps",
                          currentImageUrl: null,
                        },
                        logo: {
                          websiteIdentity: {
                            name: "Google Maps",
                            canonicalDomain: "maps.google.com",
                          },
                        },
                      },
                    ],
              },
            }),
          );
        }
        if (url.includes("/actors/dashboard-list")) {
          return new Response(
            JSON.stringify({
              data: {
                total: 1,
                items: [
                  {
                    id: "actor_1",
                    apifyActorId: "ap_1",
                    username: "builder",
                    actorName: "maps",
                    title: "Maps",
                    description: null,
                    snapshots: [],
                    insightSnapshots: [],
                    effectivePictureUrl: applied ? pictureUrl : "/api/website-logo-assets/logo_1",
                    pictureSource: applied ? "actor" : "website",
                  },
                ],
              },
            }),
          );
        }
        if (url.includes("/actors/optimization/summary"))
          return new Response(JSON.stringify({ data: [] }));
        if (url.includes("/intelligence/earnings"))
          return new Response(JSON.stringify({ data: { items: [] } }));
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const { container } = render(
      <>
        <BulkLogoReview />
        <ActorsWorkspace />
      </>,
    );
    await screen.findAllByText("Local preview");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Maps for logo review" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 logo to Apify" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 logo" }));
    await waitFor(() =>
      expect(
        container.querySelector('[data-picture-source="actor"]')?.getAttribute("data-picture-url"),
      ).toBe(pictureUrl),
    );
    expect(screen.queryByText("Local preview")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Select Maps for logo review" })).toBeNull();
  });

  it("clears selected Actors when the active workspace changes", async () => {
    window.history.replaceState(null, "", "/dashboard/actors");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/apify/status")) {
          return new Response(
            JSON.stringify({ data: { connected: true, apiKeyConfigured: true } }),
            { status: 200 },
          );
        }
        if (url.includes("/actors/dashboard-list")) {
          return new Response(
            JSON.stringify({
              data: {
                items: [
                  {
                    id: "actor_1",
                    username: "owner",
                    actorName: "sample-actor",
                    apifyActorId: "apify_1",
                    title: "Sample Actor",
                    description: "Test Actor",
                    snapshots: [],
                    insightSnapshots: [],
                  },
                ],
                total: 1,
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/actors/optimization/summary")) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<ActorsWorkspace />);
    const actorCheckbox = (
      await screen.findAllByRole("checkbox", {
        name: "Select Sample Actor",
      })
    )[0]!;
    fireEvent.click(actorCheckbox);
    expect(await screen.findByText("1 Actor selected")).toBeTruthy();
    expect(screen.getByText("Clear selection")).toBeTruthy();

    window.dispatchEvent(new Event("actorconsole:workspace-changed"));

    await waitFor(() => expect(screen.queryByText("1 Actor selected")).toBeNull());
  });
});
