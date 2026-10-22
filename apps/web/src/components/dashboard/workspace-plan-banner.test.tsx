import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspacePlanUsage } from "@actorconsole/shared/plans";
import { WorkspacePlanBanner } from "./workspace-plan-banner";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WorkspacePlanBanner", () => {
  it("hydrates without mismatches when server and browser date locales differ", async () => {
    const localeDate = vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("server date");
    const banner = (
      <WorkspacePlanBanner
        workspaceId="bp1"
        plan="PRO"
        currentUsage={{
          ...workspacePlanUsage("PRO", 3, 125),
          checkedAt: "2026-10-02T19:24:53.000Z",
        }}
      />
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(banner);
    document.body.appendChild(container);
    localeDate.mockReturnValue("browser date");
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, banner, { onRecoverableError });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Last checked 2026-10-02 19:24 UTC.");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
      localeDate.mockRestore();
    }
  });
  it("uses the current access decision for live counters without a duplicate API request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <WorkspacePlanBanner
        workspaceId="bp1"
        plan="FREE"
        currentUsage={workspacePlanUsage("FREE", 20, 100)}
      />,
    );
    expect(screen.getByLabelText("Workspace plan usage").textContent).toContain("20 / 50");
    view.rerender(
      <WorkspacePlanBanner
        workspaceId="bp1"
        plan="FREE"
        currentUsage={workspacePlanUsage("FREE", 51, 100)}
      />,
    );
    expect(screen.getByLabelText("Workspace plan usage").textContent).toContain("51 / 50");
    expect(screen.getByText("Your workspace needs Pro")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [51, 100, "51 Apify actors"],
    [2, 501, "501 reported users"],
  ])("offers an upgrade for %i actors and %i monthly users", async (actors, users, expected) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ data: workspacePlanUsage("FREE", actors, users) })),
        ),
    );
    render(<WorkspacePlanBanner workspaceId="bp1" plan="FREE" />);
    expect(await screen.findByText("Your workspace needs Pro")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(expected);
    expect(screen.getByRole("link", { name: "Upgrade to Pro" }).getAttribute("href")).toBe(
      "/dashboard/billing",
    );
  });

  it("keeps exactly 50 actors and 500 users on Free", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: workspacePlanUsage("FREE", 50, 500) })),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspacePlanBanner workspaceId="bp1" plan="FREE" />);
    await screen.findByText("Your workspace is approaching the Free limits");
    expect(screen.queryByText("Your workspace needs Pro")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("All features remain available");
    expect(screen.getByLabelText("Workspace plan usage").textContent).toContain("50 / 50");
  });

  it("does not fetch before selecting a workspace", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspacePlanBanner workspaceId={null} plan="FREE" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discards the previous workspace's audience when switching workspaces", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: workspacePlanUsage("FREE", 51, 100) })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: workspacePlanUsage("FREE", 5, 100) })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<WorkspacePlanBanner workspaceId="bp1" plan="FREE" />);
    await screen.findByText("Your workspace needs Pro");
    view.rerender(<WorkspacePlanBanner workspaceId="bp2" plan="FREE" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { "x-business-profile-id": "bp2" } }),
    );
  });
});

it.each([
  [40, 100],
  [5, 400],
])("warns early at %i actors / %i users", async (actors, users) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: workspacePlanUsage("FREE", actors, users) })),
      ),
  );
  render(<WorkspacePlanBanner workspaceId="bp1" plan="FREE" />);
  await screen.findByText("Your workspace is approaching the Free limits");
  expect(screen.getByRole("link", { name: "View Pro options" })).toBeTruthy();
  expect(screen.queryByText("Your workspace needs Pro")).toBeNull();
});

it("shows counters below warning thresholds and labels partial audience counts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            ...workspacePlanUsage("FREE", 5, 100),
            monthlyUsersComplete: false,
          },
        }),
      ),
    ),
  );
  render(<WorkspacePlanBanner workspaceId="bp1" plan="FREE" />);
  await screen.findByText("At least 100 / 500");
  expect(screen.getByLabelText("Workspace plan usage").textContent).toContain("5 / 50");
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows unlimited Pro counters without an upgrade notice", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: workspacePlanUsage("PRO", 100, 1000) })),
      ),
  );
  render(<WorkspacePlanBanner workspaceId="bp1" plan="PRO" />);
  await screen.findByText("100 / Unlimited");
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows missing audience as not reported, rather than zero", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: workspacePlanUsage("FREE", 5, null) })),
      ),
  );
  render(<WorkspacePlanBanner workspaceId="bp1" plan="FREE" />);
  await screen.findByText("Not reported / 500");
  expect(screen.queryByRole("status")).toBeNull();
});
