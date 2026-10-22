import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refreshWorkspaceActors } = vi.hoisted(() => ({
  refreshWorkspaceActors: vi.fn().mockResolvedValue("completed"),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/actors" }));
vi.mock("@/lib/actor-refresh", () => ({ refreshWorkspaceActors }));

import { WorkspaceDataRefresher } from "./workspace-data-refresher";

describe("WorkspaceDataRefresher", () => {
  it("suspends operational synchronization while a workspace is restricted", async () => {
    render(<WorkspaceDataRefresher workspaceId="workspace_1" disabled />);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(refreshWorkspaceActors).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("starts only one background refresh for repeated renders of a workspace", async () => {
    const view = render(<WorkspaceDataRefresher workspaceId="workspace_1" />);

    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(refreshWorkspaceActors).toHaveBeenCalledOnce();

    view.rerender(<WorkspaceDataRefresher workspaceId="workspace_1" />);
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(refreshWorkspaceActors).toHaveBeenCalledOnce();
  });

  it("refreshes the newly selected workspace without reloading the page", async () => {
    const view = render(<WorkspaceDataRefresher workspaceId="workspace_1" />);
    await act(async () => vi.advanceTimersByTimeAsync(1_500));

    view.rerender(<WorkspaceDataRefresher workspaceId="workspace_2" />);
    await act(async () => vi.advanceTimersByTimeAsync(1_500));

    expect(refreshWorkspaceActors).toHaveBeenCalledTimes(2);
    expect(refreshWorkspaceActors.mock.calls[1]?.[0]).not.toHaveProperty("onCompleted");
  });

  it("shares the automatic cooldown across reloads and tabs", async () => {
    window.localStorage.setItem(
      "actorconsole:actor-auto-refresh-v2:workspace_1",
      String(Date.now()),
    );
    render(<WorkspaceDataRefresher workspaceId="workspace_1" />);
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(refreshWorkspaceActors).not.toHaveBeenCalled();
  });

  it("deduplicates remounts within the same document", async () => {
    const first = render(<WorkspaceDataRefresher workspaceId="workspace_1" />);
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    first.unmount();
    render(<WorkspaceDataRefresher workspaceId="workspace_1" />);
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(refreshWorkspaceActors).toHaveBeenCalledOnce();
  });

  it("refreshes once the previous automatic attempt is older than five minutes", async () => {
    window.localStorage.setItem("actorconsole:actor-auto-refresh-v2:workspace_1", String(Date.now() - 300_001));
    render(<WorkspaceDataRefresher workspaceId="workspace_1" />);
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(refreshWorkspaceActors).toHaveBeenCalledOnce();
  });

  it("waits for visibility before starting work in a hidden tab", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<WorkspaceDataRefresher workspaceId="workspace_1" />);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(refreshWorkspaceActors).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(refreshWorkspaceActors).toHaveBeenCalledOnce();
    visibility.mockRestore();
  });
});
