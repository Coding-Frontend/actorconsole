import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

import { ActorActions } from "./actor-actions";

describe("ActorActions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("labels a website fallback as a local preview with a path to apply it", () => {
    render(
      <ActorActions
        actorId="actor-id"
        apifyActorId="apify-id"
        apifyUsername="builder"
        actorName="maps"
        title="Maps Actor"
        description={null}
        imageUrl="/api/website-logo-assets/logo_1"
        imageSource="website"
        categories={[]}
        pricingEvents={{}}
      />,
    );
    expect(screen.getByText("Website logo preview")).toBeTruthy();
    expect(screen.getByText(/Shown only in ActorConsole/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review and apply logos" }).getAttribute("href")).toBe(
      "/dashboard/actors/logos",
    );
    expect(screen.queryByText("Apify thumbnail")).toBeNull();
  });

  it("shows optimization and pricing together without per-Actor automation tabs", () => {
    render(
      <ActorActions
        actorId="actor-id"
        apifyActorId="apify-id"
        apifyUsername="builder"
        actorName="maps"
        title="Maps Actor"
        description="Extract Maps data"
        imageUrl={null}
        categories={["AUTOMATION"]}
        pricingEvents={{ result: { eventPriceUsd: 0.002, eventTitle: "Result" } }}
      />,
    );

    expect(screen.getByRole("button", { name: /Rewrite copy/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Rewrite README/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Generate image/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Update pay-per-event pricing/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Generate output schema/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Generate all improvements/ })).toBeTruthy();
    expect(screen.queryByText("Quick actions")).toBeNull();
    expect(screen.queryByText("Automate")).toBeNull();
    expect(screen.queryByText("Schedule Actor runs")).toBeNull();
  });

  it("opens focused actions in the shared improvement run page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { runId: "run_output" } }), { status: 202 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ActorActions
        actorId="actor-id"
        apifyActorId="apify-id"
        apifyUsername="builder"
        actorName="maps"
        title="Maps Actor"
        description="Extract Maps data"
        imageUrl={null}
        categories={[]}
        pricingEvents={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate all improvements/ }));

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/dashboard/actors/optimization/run_output"),
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      actorIds: ["actor-id"],
      kind: "GENERATE_IMPROVEMENTS",
      fields: ["title", "description", "pricing"],
    });
  });

  it("opens the direct pricing editor instead of starting an AI generation run", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        ok: true,
        data: String(input).endsWith("/pricing/recommendation")
          ? null
          : { periods: [], active: null, scheduled: [], earliestStartsAt: "2026-11-05T00:00:00Z" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ActorActions
        actorId="actor-id"
        apifyActorId="apify-id"
        apifyUsername="builder"
        actorName="maps"
        title="Maps Actor"
        description="Extract Maps data"
        imageUrl={null}
        categories={[]}
        pricingEvents={{ result: { eventPriceUsd: 0.002, eventTitle: "Result" } }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Update pay-per-event pricing/ }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByDisplayValue("result")).toBeTruthy();
    expect(screen.getByDisplayValue("0.002")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const requests = fetchMock.mock.calls.map(([input, init]) => ({
      path: new URL(String(input), "http://localhost").pathname,
      method: init?.method ?? "GET",
    }));
    expect(requests).toContainEqual({
      path: expect.stringMatching(/\/actors\/apify-id\/pricing$/),
      method: "GET",
    });
    expect(requests).toContainEqual({
      path: expect.stringMatching(/\/actors\/apify-id\/pricing\/recommendation$/),
      method: "GET",
    });
    expect(
      requests.every(
        ({ path, method }) =>
          /\/actors\/apify-id\/pricing(?:\/recommendation)?$/.test(path) && method === "GET",
      ),
    ).toBe(true);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("opens the listing copy review tool", async () => {
    render(
      <ActorActions
        actorId="actor-id"
        apifyActorId="apify-id"
        apifyUsername="builder"
        actorName="maps"
        title="Maps Actor"
        description="Extract Maps data"
        imageUrl={null}
        categories={["AUTOMATION"]}
        pricingEvents={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Rewrite copy/ }));
    expect(await screen.findByRole("button", { name: "Generate variants" })).toBeTruthy();
    expect(screen.getAllByText(/Store categories/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
  });

  it("shows grouped category metadata and submits correction feedback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { submitted: true } }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ActorActions
        actorId="actor-id"
        apifyActorId="apify-id"
        apifyUsername="builder"
        actorName="maps"
        title="Maps Actor"
        description="Extract Maps data"
        imageUrl={null}
        categories={["AUTOMATION"]}
        metaLabels={[{ _id: "label-1", type: "USE_CASE", name: "Lead generation" }]}
        pricingEvents={{}}
      />,
    );

    expect(screen.getByText("USE CASE: Lead generation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Suggest a correction/ }));
    fireEvent.change(screen.getByPlaceholderText(/This Actor extracts e-commerce/), {
      target: { value: "This Actor should be classified as an AI tool." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toContain("/actors/apify-id/categories/feedback");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      details: "This Actor should be classified as an AI tool.",
    });
  });
});
