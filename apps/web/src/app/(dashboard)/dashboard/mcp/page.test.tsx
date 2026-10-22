import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { workspacePlanUsage } from "@actorconsole/shared/plans";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import McpPage from "./page";

const credential = {
  id: "key-1",
  name: "Codex desktop",
  keyPreview: "…abcd",
  scopes: ["read", "write", "mcp"],
  actorIds: [],
  lastUsedAt: null,
  expiresAt: "2027-01-01T00:00:00.000Z",
  revokedAt: null,
  rotatedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

function installFetch(options: { actorPages?: boolean; overLimit?: boolean } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/account/api-keys") && init?.method === "POST") {
      return jsonResponse(
        {
          ok: true,
          data: {
            ...credential,
            id: "key-2",
            name: "Cursor laptop",
            keyPreview: "…efgh",
            key: "al_one_time_secret",
          },
        },
        201,
      );
    }
    if (url.endsWith("/account/api-keys/key-1") && init?.method === "PATCH") {
      return jsonResponse({
        ok: true,
        data: { ...credential, name: "Codex desktop edited" },
      });
    }
    if (url.endsWith("/account/api-keys/key-1/rotate")) {
      return jsonResponse({
        ok: true,
        data: {
          key: "al_rotated_secret",
          keyPreview: "…new1",
          lastUsedAt: null,
          expiresAt: "2027-02-01T00:00:00.000Z",
          rotatedAt: "2026-08-11T00:00:00.000Z",
        },
      });
    }
    if (url.endsWith("/account/api-keys/key-1") && init?.method === "DELETE") {
      return jsonResponse({ ok: true, data: { id: "key-1" } });
    }
    if (/\/account\/api-keys(?:\?|$)/.test(url)) {
      return jsonResponse({
        ok: true,
        data: { items: [credential], total: 1, page: 1, limit: 25, activeCount: 1 },
      });
    }
    if (url.endsWith("/mcp/info")) {
      return jsonResponse({
        ok: true,
        data: { transport: "stdio", tools: ["list_actors", "get_actor"] },
      });
    }
    if (url.endsWith("/account/navigation-status")) {
      return jsonResponse({ ok: true, data: { plan: "PRO" } });
    }
    if (url.endsWith("/actors/plan-usage")) {
      return jsonResponse({
        ok: true,
        data: workspacePlanUsage(
          options.overLimit ? "FREE" : "PRO",
          options.overLimit ? 51 : 2,
          100,
        ),
      });
    }
    if (url.includes("/account/api-key-actors?limit=500&page=")) {
      const secondPage = url.endsWith("page=2");
      return jsonResponse({
        ok: true,
        data: {
          items: [
            {
              apifyActorId: secondPage ? "actor-2" : "actor-1",
              title: secondPage ? "Second Actor" : "Maps scraper",
              actorName: secondPage ? "second-actor" : "maps-scraper",
              username: "builder",
            },
          ],
          total: options.actorPages ? 2 : 1,
          page: secondPage ? 2 : 1,
          limit: 500,
        },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  return fetchMock;
}

describe("MCP access page", () => {
  it("keeps connection setup and credential creation available above the Free limits", async () => {
    installFetch({ overLimit: true });
    render(<McpPage />);
    await screen.findByText("Codex desktop");
    expect(screen.getByText(/MCP connection and credentials remain available/i)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Issue credential" })[0]);
    fireEvent.change(screen.getByLabelText("Client name"), { target: { value: "Cursor laptop" } });
    fireEvent.click(screen.getByRole("button", { name: "Issue MCP credential" }));
    expect(await screen.findByText("al_one_time_secret")).toBeTruthy();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("organizes MCP credentials, client setup, and activity in one page", async () => {
    installFetch();
    render(<McpPage />);

    expect(await screen.findByRole("heading", { name: "MCP access" })).toBeTruthy();
    expect(screen.getByText(/these credentials authenticate MCP access only/i)).toBeTruthy();
    expect(screen.getByText("Codex desktop")).toBeTruthy();
    expect(screen.getByText("ActorConsole MCP only")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rotate" })).toBeTruthy();
    expect(screen.getByLabelText("Credentials per page")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Client setup" })).toBeTruthy();
    expect(screen.getByText("Registered tools")).toBeTruthy();
    expect(screen.getByText("Copy the secret once")).toBeTruthy();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.queryByText("Create API key")).toBeNull();
  });

  it("creates, edits, rotates, and revokes fixed-purpose MCP credentials", async () => {
    const fetchMock = installFetch();
    render(<McpPage />);
    await screen.findByText("Codex desktop");

    fireEvent.click(screen.getAllByRole("button", { name: "Issue credential" })[0]);
    fireEvent.change(screen.getByLabelText("Client name"), {
      target: { value: "Cursor laptop" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Issue MCP credential" }));

    await screen.findByText("al_one_time_secret");
    const createRequest = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/account/api-keys") && init?.method === "POST",
    );
    expect(JSON.parse(String(createRequest?.[1]?.body))).toEqual(
      expect.objectContaining({ name: "Cursor laptop", actorIds: [] }),
    );
    expect(JSON.parse(String(createRequest?.[1]?.body))).not.toHaveProperty("scopes");
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Close" })
        .find((button) => button.textContent === "Close")!,
    );

    const originalCredential = screen.getByText("Codex desktop").closest("tr")!;
    fireEvent.click(within(originalCredential).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Client name"), {
      target: { value: "Codex desktop edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Codex desktop edited")).toBeTruthy());
    const editRequest = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/account/api-keys/key-1") && init?.method === "PATCH",
    );
    expect(JSON.parse(String(editRequest?.[1]?.body))).toEqual(
      expect.objectContaining({ name: "Codex desktop edited", actorIds: [] }),
    );

    const editedCredential = screen.getByText("Codex desktop edited").closest("tr")!;
    fireEvent.click(within(editedCredential).getByRole("button", { name: "Rotate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rotate credential" }));
    await screen.findByText("al_rotated_secret");
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Close" })
        .find((button) => button.textContent === "Close")!,
    );

    fireEvent.click(screen.getByRole("button", { name: "Revoke Codex desktop edited" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revoke credential" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/account/api-keys/key-1") && init?.method === "DELETE",
        ),
      ).toBe(true);
      expect(screen.getByText("revoked")).toBeTruthy();
    });
  }, 15_000);

  it("loads every Actor page before offering restricted credential scope", async () => {
    const fetchMock = installFetch({ actorPages: true });
    render(<McpPage />);
    await screen.findByText("Codex desktop");

    fireEvent.click(screen.getAllByRole("button", { name: "Issue credential" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Selected only" }));

    expect(await screen.findByText("Second Actor")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/account/api-key-actors?limit=500&page=2"),
      ),
    ).toBe(true);
  });
});
