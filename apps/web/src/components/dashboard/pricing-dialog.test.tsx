import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, data: null }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, data: { changed: true } }), { status: 200 }),
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
    fireEvent.click(screen.getByRole("button", { name: "Schedule pricing update" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const request = vi.mocked(fetch).mock.calls[1];
    const payload = JSON.parse(String((request?.[1] as RequestInit).body));
    expect(payload.pricing.events).toMatchObject({
      start: { isOneTimeEvent: true },
      result: { isPrimaryEvent: true },
    });
    expect(toastError).not.toHaveBeenCalled();
  });
});
