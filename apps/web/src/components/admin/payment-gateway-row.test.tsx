import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentGatewayRow, type PaymentGatewayView } from "./payment-gateway-row";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/admin/api", () => ({ api: (...args: unknown[]) => mocks.api(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

const readiness = {
  ready: true,
  configuredKeys: ["dodo_product_id_pro_month", "dodo_product_id_pro_year"],
  missingCredentials: [],
  missingProducts: [],
};
const gateway: PaymentGatewayView = {
  key: "dodo",
  name: "Dodo Payments",
  enabled: true,
  updatedAt: null,
  callbackUrl: null,
  mode: "test",
  readiness,
  profiles: (["test", "live"] as const).map((mode) => ({
    mode,
    readiness,
    billingOptions: [
      { interval: "month", amountMinor: 1900, currency: "USD" },
      { interval: "year", amountMinor: 19900, currency: "USD" },
    ],
    fields: [
      {
        key: "dodo_api_key",
        label: "Dodo API key",
        description: "API key",
        isSecret: true,
        configured: true,
      },
      ...(["month", "year"] as const).map((cycle) => ({
        key: `dodo_product_id_pro_${cycle}`,
        label: `${cycle} product`,
        description: "Product ID",
        isSecret: false,
        configured: true,
        value: `pdt_${mode}_${cycle}`,
      })),
      {
        key: "dodo_product_id_pro",
        label: "Legacy Pro ID",
        description: "Legacy",
        isSecret: false,
        configured: true,
        value: "legacy",
      },
    ],
  })),
};

function renderGateway() {
  render(
    <PaymentGatewayRow
      gateway={gateway}
      webhookUrl="https://actorconsole.com/api/billing/webhooks/dodo"
    />,
  );
}

describe("Monthly and yearly plan settings", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers only two editable plans and no generic Pro or product creation form", () => {
    renderGateway();
    expect(screen.getByRole("heading", { name: "Monthly Pro plan" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Yearly Pro plan" })).toBeTruthy();
    expect(screen.getByText("$199.00 / year")).toBeTruthy();
    expect(screen.queryByText("Create a subscription product")).toBeNull();
    expect(screen.queryByLabelText("Legacy Pro ID")).toBeNull();
    expect(screen.queryByLabelText("Subscription price")).toBeNull();
  });

  it.each(["month", "year"] as const)(
    "verifies and saves only the selected %s plan",
    async (cycle) => {
      mocks.api.mockResolvedValue({ ok: true, data: {} });
      renderGateway();
      const label = cycle === "year" ? "Yearly" : "Monthly";
      fireEvent.change(screen.getByLabelText(`${label} subscription product id`), {
        target: { value: " pdt_existing " },
      });
      fireEvent.click(
        screen.getByRole("button", { name: `Verify and save ${label.toLowerCase()} plan` }),
      );
      await waitFor(() =>
        expect(mocks.api).toHaveBeenCalledWith("/admin/payment-gateways/dodo/products/import", {
          method: "POST",
          body: JSON.stringify({ productId: "pdt_existing", interval: cycle, mode: "test" }),
        }),
      );
      expect(mocks.refresh).toHaveBeenCalledOnce();
    },
  );

  it("keeps plan drafts and does not refresh when verification fails", async () => {
    mocks.api.mockResolvedValue({ ok: false, error: { message: "Wrong billing interval" } });
    renderGateway();
    fireEvent.change(screen.getByLabelText("Yearly subscription product id"), {
      target: { value: "pdt_wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and save yearly plan" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Wrong billing interval"));
    expect(
      (screen.getByLabelText("Yearly subscription product id") as HTMLInputElement).value,
    ).toBe("pdt_wrong");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("preserves independent environment drafts and allows discarding one plan", () => {
    renderGateway();
    fireEvent.change(screen.getByLabelText("Monthly subscription product id"), {
      target: { value: "test_draft" },
    });
    fireEvent.change(screen.getByLabelText("Configure environment"), { target: { value: "live" } });
    expect(
      (screen.getByLabelText("Monthly subscription product id") as HTMLInputElement).value,
    ).toBe("pdt_live_month");
    fireEvent.change(screen.getByLabelText("Configure environment"), { target: { value: "test" } });
    expect(
      (screen.getByLabelText("Monthly subscription product id") as HTMLInputElement).value,
    ).toBe("test_draft");
    fireEvent.click(screen.getByRole("button", { name: "Discard monthly changes" }));
    expect(
      (screen.getByLabelText("Monthly subscription product id") as HTMLInputElement).value,
    ).toBe("pdt_test_month");
  });

  it("saves credentials separately and blocks plan verification until they are saved", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    renderGateway();
    expect((screen.getByLabelText("Dodo API key") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Dodo API key"), { target: { value: "private_key" } });
    expect(
      (screen.getByRole("button", { name: "Verify and save monthly plan" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save test settings" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/payment-gateways/dodo/configuration", {
        method: "PUT",
        body: JSON.stringify({ mode: "test", settings: { dodo_api_key: "private_key" } }),
      }),
    );
  });
});
