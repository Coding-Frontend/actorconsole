import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("sonner", () => ({ toast }));

import { LogoRecommendations } from "./logo-recommendations";
import { WORKSPACE_DATA_REFRESHED_EVENT } from "@/lib/actor-refresh";
import { WORKSPACE_CHANGED_EVENT } from "@/components/dashboard/onboarding-gate";

const recommendation = {
  id: "recommendation_1",
  error: null,
  proposedImageUrl: "/api/website-logo-assets/logo_1",
  actor: {
    id: "actor_1",
    apifyActorId: "apify_1",
    title: "Google Maps Scraper",
    actorName: "google-maps-scraper",
    currentImageUrl: "https://images.example.com/current.webp",
  },
  logo: { websiteIdentity: { name: "Google Maps", canonicalDomain: "maps.google.com" } },
};

describe("LogoRecommendations", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each(["Apply to Apify", "Dismiss"])(
    "refreshes Actor data and recommendations after %s",
    async (button) => {
      let pending = true;
      const refreshed = vi.fn();
      window.addEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refreshed);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === "POST") {
            pending = false;
            return new Response(
              JSON.stringify({
                ok: true,
                data: { pictureUrl: "https://images.apify.com/new.webp" },
              }),
            );
          }
          return new Response(JSON.stringify({ data: { items: pending ? [recommendation] : [] } }));
        }),
      );
      try {
        render(<LogoRecommendations />);
        fireEvent.click(await screen.findByRole("button", { name: "Review logos" }));
        fireEvent.click(screen.getByRole("button", { name: button }));
        await waitFor(() => expect(refreshed).toHaveBeenCalledOnce());
        await waitFor(() =>
          expect(screen.queryByRole("button", { name: "Review logos" })).toBeNull(),
        );
      } finally {
        window.removeEventListener(WORKSPACE_DATA_REFRESHED_EVENT, refreshed);
      }
    },
  );

  it("ignores a late response from the previous workspace", async () => {
    let finishOld!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finishOld = resolve;
            }),
        )
        .mockResolvedValue(new Response(JSON.stringify({ data: { items: [] } }))),
    );
    render(<LogoRecommendations />);
    fireEvent(window, new Event(WORKSPACE_CHANGED_EVENT));
    await act(async () => {
      finishOld(new Response(JSON.stringify({ data: { items: [recommendation] } })));
    });
    expect(screen.queryByRole("button", { name: "Review logos" })).toBeNull();
  });

  it("closes the previous workspace's review when the active workspace changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: { items: [recommendation] } })))
        .mockResolvedValue(new Response(JSON.stringify({ data: { items: [] } }))),
    );
    render(<LogoRecommendations />);
    fireEvent.click(await screen.findByRole("button", { name: "Review logos" }));
    expect(screen.getByRole("button", { name: "Apply to Apify" })).toBeTruthy();
    fireEvent(window, new Event(WORKSPACE_CHANGED_EVENT));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Apply to Apify" })).toBeNull(),
    );
  });

  it("shows current and proposed images and keeps an unavailable-credential update pending", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            error: {
              message: "Reconnect your Apify publishing credential before applying this logo",
              details: { link: "/dashboard/apify" },
            },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: { items: [recommendation] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LogoRecommendations />);

    fireEvent.click(await screen.findByRole("button", { name: "Review logos" }));
    expect(await screen.findByAltText("Current Actor thumbnail")).toBeTruthy();
    expect(screen.getByAltText("Proposed Google Maps logo")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Apply to Apify" }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Update credentials" }).getAttribute("href")).toBe(
        "/dashboard/apify",
      ),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Reconnect your Apify publishing credential before applying this logo",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/logo-recommendations/recommendation_1/apply"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
