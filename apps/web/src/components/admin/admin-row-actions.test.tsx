import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/admin/api", () => ({ api: (...args: unknown[]) => mocks.api(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { PaymentRowActions } from "./payment-row-actions";
import { SubscriptionRowActions } from "./subscription-row-actions";
import { EmailLogRowActions } from "./email-log-row-actions";

describe("Admin row actions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("collects a reason and optional amount before refunding", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <PaymentRowActions
        payment={{ id: "payment_1", status: "captured", provider: "razorpay" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refund" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Customer request" } });
    fireEvent.change(screen.getByLabelText("Amount in paise (optional)"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Process refund" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/payments/payment_1/refund", {
        method: "POST",
        body: JSON.stringify({ amount: 500, reason: "Customer request" }),
      }),
    );
  });

  it("rejects zero-value partial refunds before calling the API", async () => {
    render(
      <PaymentRowActions
        payment={{ id: "payment_1", status: "captured", provider: "razorpay" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refund" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Correction" } });
    fireEvent.change(screen.getByLabelText("Amount in paise (optional)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Process refund" }));

    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(
      "Enter a positive whole-number refund amount in paise",
    );
  });

  it("requires an audit reason before cancelling a subscription", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(<SubscriptionRowActions subscriptionId="subscription_1" status="active" />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Customer request" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel subscription" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/subscriptions/subscription_1/cancel", {
        method: "POST",
        body: JSON.stringify({ reason: "Customer request" }),
      }),
    );
  });

  it("shows provider and failure details for an email log row", () => {
    render(
      <EmailLogRowActions
        email={{
          id: "email_1",
          to: "builder@example.com",
          subject: "Deployment failed",
          template: "deployment-result",
          status: "failed",
          providerId: "provider_123",
          eventType: "delivery_failed",
          error: "Mailbox unavailable",
          createdAt: "2026-08-23T00:00:00.000Z",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Inspect email to builder@example.com" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("provider_123")).toBeTruthy();
    expect(screen.getByText("Mailbox unavailable")).toBeTruthy();
  });
});
