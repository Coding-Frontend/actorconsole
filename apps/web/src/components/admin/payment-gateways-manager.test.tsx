import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentGatewaysManager } from "./payment-gateways-manager";
import type { PaymentGatewayView } from "./payment-gateway-row";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
  apiBase: "/api",
}));
vi.mock("@/lib/api-base", () => ({
  get API_BASE_URL() {
    return mocks.apiBase;
  },
}));
vi.mock("@/lib/admin/api", () => ({ api: (...args: unknown[]) => mocks.api(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }));

const gateways: PaymentGatewayView[] = ["stripe", "dodo"].map((key) => ({
  key,
  name: key === "dodo" ? "Dodo Payments" : "Stripe",
  enabled: key === "dodo",
  updatedAt: null,
  callbackUrl: null,
  mode: "test",
  readiness: { ready: true, configuredKeys: [], missingCredentials: [], missingProducts: [] },
  profiles: (["test", "live"] as const).map((mode) => ({
    mode,
    readiness: {
      ready: mode === "test",
      configuredKeys: [],
      missingCredentials: [],
      missingProducts: [],
    },
    billingOptions: [],
    fields: [
      {
        key: `${key}_api_key`,
        label: `${key} API key`,
        description: "API key",
        isSecret: true,
        configured: true,
      },
    ],
  })),
}));

describe("Payment provider workspace", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.apiBase = "/api";
  });

  it("shows the direct Node.js webhook URL for the static deployment", () => {
    mocks.apiBase = "https://api.actorconsole.com";
    render(<PaymentGatewaysManager gateways={gateways} siteUrl="https://actorconsole.com" />);
    expect(
      (within(screen.getByRole("tabpanel")).getByLabelText("Webhook URL") as HTMLInputElement)
        .value,
    ).toBe("https://api.actorconsole.com/billing/webhooks/dodo?mode=test");
  });

  it("starts with an enabled provider and shows only its settings", () => {
    render(<PaymentGatewaysManager gateways={gateways} siteUrl="https://actorconsole.com" />);
    expect(screen.getByRole("tab", { name: /Dodo Payments/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Dodo Payments" })).toBeTruthy();
  });

  it("preserves drafts when switching providers and environments", () => {
    render(<PaymentGatewaysManager gateways={gateways} siteUrl="https://actorconsole.com" />);
    fireEvent.change(screen.getByLabelText("dodo API key"), { target: { value: "test_draft" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Stripe/ }), { button: 0, ctrlKey: false });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Dodo Payments/ }), {
      button: 0,
      ctrlKey: false,
    });
    const panel = screen.getByRole("tabpanel");
    const select = panel.querySelector("select")!;
    fireEvent.change(select, { target: { value: "live" } });
    expect((screen.getByLabelText("dodo API key") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Unsaved changes in the other environment")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Use live mode for checkout" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(select, { target: { value: "test" } });
    expect((screen.getByLabelText("dodo API key") as HTMLInputElement).value).toBe("test_draft");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect((screen.getByLabelText("dodo API key") as HTMLInputElement).value).toBe("");
  });

  it("keeps drafts and reports a failed save without refreshing", async () => {
    mocks.api.mockRejectedValue(new Error("offline"));
    render(<PaymentGatewaysManager gateways={gateways} siteUrl="https://actorconsole.com" />);
    fireEvent.change(screen.getByLabelText("dodo API key"), {
      target: { value: "keep_this_draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save test settings" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        expect.stringContaining("your changes have been kept"),
      ),
    );
    expect((screen.getByLabelText("dodo API key") as HTMLInputElement).value).toBe(
      "keep_this_draft",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("keeps a saved secret empty and sends null only when explicitly cleared", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(<PaymentGatewaysManager gateways={gateways} siteUrl="https://actorconsole.com" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Clear saved secret" })[0]);
    expect((screen.getByLabelText("dodo API key") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save test settings" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/payment-gateways/dodo/configuration", {
        method: "PUT",
        body: JSON.stringify({ mode: "test", settings: { dodo_api_key: null } }),
      }),
    );
  });
});
