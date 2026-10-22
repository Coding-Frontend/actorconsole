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

import { FeatureFlagRow } from "./feature-flag-row";

describe("FeatureFlagRow", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("validates and explicitly saves rollout changes", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <FeatureFlagRow
        flagKey="actor_optimization"
        description="Optimization tools"
        initial={{ enabled: false, rolloutPct: 10 }}
      />,
    );

    const rollout = screen.getByLabelText("actor_optimization rollout percentage");
    fireEvent.change(rollout, { target: { value: "25" } });
    expect(mocks.api).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/feature-flags/actor_optimization", {
        method: "PUT",
        body: JSON.stringify({ enabled: false, rolloutPct: 25 }),
      }),
    );

    mocks.api.mockClear();
    fireEvent.change(rollout, { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Rollout must be between 0 and 100 percent");
  });

  it("rolls a toggle back when saving fails", async () => {
    mocks.api.mockResolvedValue({ ok: false, error: { message: "Save failed" } });
    render(
      <FeatureFlagRow
        flagKey="actor_optimization"
        description="Optimization tools"
        initial={{ enabled: false, rolloutPct: 10 }}
      />,
    );

    const toggle = screen.getByRole("switch", { name: "actor_optimization enabled" });
    fireEvent.click(toggle);

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Save failed"));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});
