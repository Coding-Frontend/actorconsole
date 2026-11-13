import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { PricingDialog, pricingEventDrafts, pricingEventsPayload } from "./pricing-dialog";

describe("PricingDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input, init) =>
        Response.json({
          ok: true,
          data:
            init?.method === "PUT"
              ? { changed: true, verified: true, startedAt: "2030-01-01T00:00:00.000Z" }
              : String(input).includes("recommendation")
                ? null
                : {
                    periods: [],
                    active: null,
                    scheduled: [],
                    earliestStartsAt: "2030-01-01T00:00:00.000Z",
                  },
        }),
      ),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("preserves multiple Apify events and their event flags", () => {
    const drafts = pricingEventDrafts({
      "apify-actor-start": {
        eventPriceUsd: 0.001,
        eventTitle: "Actor start",
        isOneTimeEvent: true,
      },
      result: { eventPriceUsd: 0.002, eventTitle: "Result", isPrimaryEvent: true },
    });
    expect(pricingEventsPayload(drafts)).toEqual({
      "apify-actor-start": {
        eventPriceUsd: 0.001,
        eventTitle: "Actor start",
        isOneTimeEvent: true,
      },
      result: { eventPriceUsd: 0.002, eventTitle: "Result", isPrimaryEvent: true },
    });
  });

  it("round-trips every tier, including a zero price, without creating a flat price", () => {
    const event = {
      eventTitle: "Result",
      eventTieredPricingUsd: {
        FREE: { tieredEventPriceUsd: 0.01 },
        GOLD: { tieredEventPriceUsd: 0 },
      },
      isPrimaryEvent: true,
    };
    expect(pricingEventsPayload(pricingEventDrafts({ result: event }))).toEqual({ result: event });
  });

  it("ignores an older Actor's recommendation after switching Actors", async () => {
    let finish!: (response: Response) => void;
    const comparison = (amount: number, query: string) => ({
      recommendedAmount: amount,
      marketMedian: amount,
      pricedCompetitorCount: 1,
      query,
      marketRange: { low: amount, high: amount },
      actorSignals: { users30Days: null, successRate30Days: null },
      ownerAnalytics: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input) => {
        if (String(input).endsWith("actor-A/pricing/recommendation"))
          return new Promise<Response>((resolve) => {
            finish = resolve;
          });
        return Response.json({
          data: String(input).includes("recommendation")
            ? comparison(0.02, "Actor B")
            : {
                periods: [],
                active: null,
                scheduled: [],
                earliestStartsAt: "2030-01-01T00:00:00.000Z",
              },
        });
      }),
    );
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      initial: {
        events: { result: { eventTitle: "Result", eventPriceUsd: 0.01, isPrimaryEvent: true } },
      },
    };
    const view = render(<PricingDialog {...props} apifyActorId="actor-A" />);
    view.rerender(<PricingDialog {...props} apifyActorId="actor-B" />);
    await screen.findByText(/Actor B/);
    await act(async () => finish(Response.json({ data: comparison(0.99, "Actor A") })));
    expect(screen.queryByText(/Actor A/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apply median to primary event" }));
    expect((screen.getByLabelText("Price per event (USD)") as HTMLInputElement).value).toBe(
      "0.020000",
    );
  });

  it("edits tiered pricing without allowing a flat market median to replace it", async () => {
    const event = {
      eventTitle: "Result",
      eventTieredPricingUsd: {
        FREE: { tieredEventPriceUsd: 0.01 },
        GOLD: { tieredEventPriceUsd: 0.005 },
      },
      isPrimaryEvent: true,
    };
    render(
      <PricingDialog
        open
        onOpenChange={vi.fn()}
        apifyActorId="fixture"
        initial={{ events: { result: event } }}
      />,
    );
    expect((screen.getByLabelText("GOLD price (USD)") as HTMLInputElement).value).toBe("0.005");
    expect(screen.queryByLabelText("Price per event (USD)")).toBeNull();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Review pricing changes" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText("GOLD price (USD)"), { target: { value: "0.003" } });
    fireEvent.click(screen.getByRole("button", { name: "Review pricing changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule pricing update" }));
    await screen.findByText("Pricing schedule verified");
    const sent = JSON.parse(
      String(vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body),
    );
    expect(sent.pricing.events.result.eventTieredPricingUsd).toEqual({
      FREE: { tieredEventPriceUsd: 0.01 },
      GOLD: { tieredEventPriceUsd: 0.003 },
    });
    expect(sent.pricing.events.result).not.toHaveProperty("eventPriceUsd");
  });

  it("renders all events, adds another, and submits one pay-per-event period", async () => {
    render(
      <PricingDialog
        open
        onOpenChange={vi.fn()}
        onChanged={vi.fn()}
        apifyActorId="owner~actor"
        initial={{
          events: {
            start: { eventPriceUsd: 0.001, eventTitle: "Actor start", isOneTimeEvent: true },
            result: { eventPriceUsd: 0.002, eventTitle: "Result", isPrimaryEvent: true },
          },
        }}
      />,
    );
    expect(screen.getAllByText(/Event \d/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Add event" }));
    expect(screen.getAllByText(/Event \d/)).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Remove event 3" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Review pricing changes" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review pricing changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule pricing update" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const request = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PUT");
    const payload = JSON.parse(String((request?.[1] as RequestInit).body));
    expect(payload.pricing.events).toMatchObject({
      start: { isOneTimeEvent: true },
      result: { isPrimaryEvent: true },
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reloads Apify's actual scheduled prices after a verification mismatch", async () => {
    let reads = 0;
    const onChanged = vi.fn();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === "PUT")
        return Response.json(
          { error: { message: "Apify adjusted the requested prices. Refresh and review." } },
          { status: 502 },
        );
      if (String(input).includes("recommendation")) return Response.json({ data: null });
      reads += 1;
      return Response.json({
        data: {
          periods: [],
          active: null,
          scheduled:
            reads > 1
              ? [
                  {
                    startedAt: "2030-01-01T00:00:00.000Z",
                    pricingPerEvent: {
                      actorChargeEvents: {
                        result: {
                          eventTitle: "Result",
                          eventTieredPricingUsd: {
                            FREE: { tieredEventPriceUsd: 0.01 },
                            GOLD: { tieredEventPriceUsd: 0.0025 },
                          },
                        },
                      },
                    },
                  },
                ]
              : [],
          earliestStartsAt: "2030-01-01T00:00:00.000Z",
        },
      });
    });
    render(
      <PricingDialog
        open
        onOpenChange={vi.fn()}
        onChanged={onChanged}
        apifyActorId="fixture"
        initial={{ events: { result: { eventTitle: "Result", eventPriceUsd: 0.01 } } }}
      />,
    );
    const review = screen.getByRole("button", { name: "Review pricing changes" });
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(review);
    fireEvent.click(screen.getByRole("button", { name: "Schedule pricing update" }));
    await screen.findByText("Apify adjusted the requested prices. Refresh and review.");
    expect(onChanged).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh pricing for review" }));
    await screen.findByText("A pricing change is already scheduled");
    expect(screen.getByText(/GOLD: \$0\.0025/)).toBeTruthy();
    expect(screen.getByText("Already scheduled")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review pricing changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Schedule pricing update" })).toBeNull();
  });

  it("locks dismissal and prevents another write while scheduling is in progress", async () => {
    const read = vi.mocked(fetch).getMockImplementation()!;
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation((input, init) =>
      init?.method === "PUT"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : read(input, init),
    );
    const onOpenChange = vi.fn();
    render(
      <PricingDialog
        open
        onOpenChange={onOpenChange}
        apifyActorId="fixture"
        initial={{ events: { result: { eventTitle: "Result", eventPriceUsd: 0.01 } } }}
      />,
    );
    const review = screen.getByRole("button", { name: "Review pricing changes" });
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(review);
    const save = screen.getByRole("button", { name: "Schedule pricing update" });
    fireEvent.click(save);
    expect(save.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(save);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(
      1,
    );
    await act(async () =>
      finish(
        Response.json({
          data: { verified: true, changed: true, startedAt: "2030-01-01T00:00:00.000Z" },
        }),
      ),
    );
    expect(screen.getByText("Pricing schedule verified")).toBeTruthy();
  });
});
