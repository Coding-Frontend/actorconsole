import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { BillingCard } from "./billing-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
const address = { address: "12 Main Street", city: "Chennai", country: "IN", zip: "600001" };
const gateways = [
  {
    key: "stripe" as const,
    name: "Stripe",
    mode: "live" as const,
    billingOptions: [
      { interval: "month" as const, amountMinor: 1900, currency: "USD" },
      { interval: "year" as const, amountMinor: 19000, currency: "USD" },
    ],
  },
];
function continueCheckout() {
  fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
}
function checkoutFetch() {
  return vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} })));
}

describe("BillingCard purchase choices", () => {
  it("honors yearly intent passed from pricing and displays the full charge", () => {
    render(
      <BillingCard
        plan="FREE"
        initialInterval="year"
        gateways={gateways}
        canCancelSubscription={false}
      />,
    );
    expect((screen.getByRole("radio", { name: /Yearly/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("$15.83")).toBeTruthy();
    expect(screen.getByText(/\$190\.00 billed yearly/)).toBeTruthy();
  });
  it.each(["month", "year"])("saves address before starting the %s checkout", async (interval) => {
    const fetchMock = checkoutFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BillingCard
        plan="FREE"
        gateways={gateways}
        billingAddress={address}
        canCancelSubscription={false}
      />,
    );
    expect(screen.queryByLabelText("Address")).toBeNull();
    expect(screen.getByText("You are currently on the Free plan.")).toBeTruthy();
    expect(screen.getByText("Compare Free and Pro")).toBeTruthy();
    expect(screen.queryByText("Stripe")).toBeNull();
    fireEvent.click(
      screen.getByRole("radio", { name: interval === "year" ? /Yearly/ : /Monthly/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Address")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toMatch(/account\/billing-address$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject(address);
    expect(fetchMock.mock.calls[1][0]).toMatch(/billing\/checkout$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      plan: "PRO",
      gateway: "stripe",
      interval,
    });
    // Missing checkout URLs must not claim that the plan was purchased.
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/temporarily unavailable/),
    );
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("opens the checkout URL after saving normalized billing details", async () => {
    const navigate = vi.spyOn(window.location, "href", "set").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { checkoutUrl: "https://checkout.example.com/session" } }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BillingCard
        plan="FREE"
        gateways={gateways}
        billingAddress={{ ...address, country: "in", city: " Chennai " }}
        canCancelSubscription={false}
      />,
    );
    continueCheckout();
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("https://checkout.example.com/session"),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).country).toBe("IN");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).city).toBe("Chennai");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("finds yearly checkout on a different enabled gateway without a provider selector", async () => {
    const fetchMock = checkoutFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BillingCard
        plan="FREE"
        billingAddress={address}
        canCancelSubscription={false}
        gateways={[
          { ...gateways[0], billingOptions: [gateways[0].billingOptions[0]] },
          {
            key: "dodo",
            name: "Dodo Payments",
            mode: "live",
            billingOptions: [{ interval: "year" }],
          },
        ]}
      />,
    );
    expect(screen.queryByText(/Dodo Payments/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Yearly/ }));
    continueCheckout();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      plan: "PRO",
      gateway: "dodo",
      interval: "year",
    });
  });

  it("prefers live checkout over test checkout and preserves admin priority among live gateways", async () => {
    const fetchMock = checkoutFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BillingCard
        plan="FREE"
        billingAddress={address}
        canCancelSubscription={false}
        gateways={[
          { ...gateways[0], mode: "test" },
          {
            key: "razorpay",
            name: "Razorpay",
            mode: "live",
            billingOptions: [{ interval: "month" }],
          },
          { key: "dodo", name: "Dodo", mode: "live", billingOptions: [{ interval: "month" }] },
        ]}
      />,
    );
    expect(screen.queryByText(/no real payment/)).toBeNull();
    continueCheckout();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).gateway).toBe("razorpay");
  });

  it("labels test checkout before and after upgrade selection", () => {
    render(
      <BillingCard
        plan="FREE"
        gateways={[{ ...gateways[0], mode: "test" }]}
        canCancelSubscription={false}
      />,
    );
    expect(screen.getByText(/no real payment/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(screen.getByText(/no real payment/)).toBeTruthy();
  });

  it("does not open checkout when saving the address fails, and allows retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, error: { message: "Address service unavailable" } }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Checkout unavailable" } }), {
          status: 503,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BillingCard
        plan="FREE"
        gateways={gateways}
        billingAddress={address}
        canCancelSubscription={false}
      />,
    );
    continueCheckout();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Address service unavailable"),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Checkout unavailable"),
    );
  });

  it("keeps network errors visible and does not continue checkout", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <BillingCard
        plan="FREE"
        gateways={gateways}
        billingAddress={address}
        canCancelSubscription={false}
      />,
    );
    continueCheckout();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Network unavailable"),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("requires address and city and blocks blank values before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<BillingCard plan="FREE" gateways={gateways} canCancelSubscription={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "   " } });
    fireEvent.submit(screen.getByLabelText("Address").closest("form")!);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Enter your address");
  });

  it("keeps the chosen cycle when returning to plan selection", () => {
    render(<BillingCard plan="FREE" gateways={gateways} canCancelSubscription={false} />);
    fireEvent.click(screen.getByRole("radio", { name: /Yearly/ }));
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to plans" }));
    expect((screen.getByRole("radio", { name: /Yearly/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText("Address")).toBeNull();
  });

  it.each([{ billingOptions: [] }, { billingOptions: [{ interval: "default" }] }])(
    "disables checkout without a configured explicit interval: %j",
    ({ billingOptions }) => {
      render(
        <BillingCard
          plan="FREE"
          gateways={[{ key: "stripe", name: "Stripe", billingOptions: billingOptions as never }]}
          canCancelSubscription={false}
        />,
      );
      expect(
        (screen.getByRole("button", { name: "Upgrade to Pro" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(screen.getByText(/temporarily unavailable/)).toBeTruthy();
    },
  );

  it("defaults to yearly when only yearly is configured and respects zero-decimal currencies", () => {
    render(
      <BillingCard
        plan="FREE"
        gateways={[
          {
            key: "dodo",
            name: "Dodo",
            billingOptions: [{ interval: "year", currency: "JPY", amountMinor: 19000 }],
          },
        ]}
        canCancelSubscription={false}
      />,
    );
    expect((screen.getByRole("radio", { name: /Yearly/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/19,000/)).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Monthly/ })).toBeNull();
    expect(screen.queryByText(/Save/)).toBeNull();
  });

  it("does not claim yearly savings across different currencies", () => {
    render(
      <BillingCard
        plan="FREE"
        gateways={[
          {
            ...gateways[0],
            billingOptions: [
              gateways[0].billingOptions[0],
              { interval: "year", amountMinor: 19000, currency: "INR" },
            ],
          },
        ]}
        canCancelSubscription={false}
      />,
    );
    expect(screen.queryByText(/Save/)).toBeNull();
  });

  it("shows Pro limits and provider-neutral subscription controls with address editing", () => {
    render(
      <BillingCard
        plan="PRO"
        gateways={gateways}
        canCancelSubscription
        subscription={{
          status: "active",
          currentPeriodEnd: "2027-01-01",
          cancelAtPeriodEnd: false,
        }}
      />,
    );
    expect(screen.getByText("You are currently on the Pro plan.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel subscription" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).toBeNull();
    expect(screen.getByText("Manage billing address")).toBeTruthy();
    expect(screen.queryByText(/Stripe/)).toBeNull();
  });
});
