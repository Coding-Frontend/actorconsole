import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogoRecommendations } from "./logo-recommendations";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { WORKSPACE_CHANGED_EVENT } from "./onboarding-gate";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const response = (total: number) => new Response(JSON.stringify({ data: { total } }));

describe("LogoRecommendations", () => {
  it("links to the full review page and displays the total beyond the first page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(501)));
    render(<LogoRecommendations />);
    const link = await screen.findByRole("link", { name: "Review logos" });
    expect(link.getAttribute("href")).toBe("/dashboard/actors/logos");
    expect(screen.getByText("501 reviewed website logos are ready")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refreshes the count after completed reviews", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(33)).mockResolvedValueOnce(response(31));
    vi.stubGlobal("fetch", fetch);
    render(<LogoRecommendations />);
    await screen.findByText("33 reviewed website logos are ready");
    fireEvent(window, new Event(WORKSPACE_DATA_REFRESHED_EVENT));
    await screen.findByText("31 reviewed website logos are ready");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("clears the old workspace count and ignores a late response", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finish = resolve;
            }),
        )
        .mockResolvedValueOnce(response(0)),
    );
    render(<LogoRecommendations />);
    fireEvent(window, new Event(WORKSPACE_CHANGED_EVENT));
    await act(async () => finish(response(33)));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Review logos" })).toBeNull());
  });
});
