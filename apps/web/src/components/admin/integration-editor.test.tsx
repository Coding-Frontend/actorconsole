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

import { IntegrationEditor } from "./integration-editor";

describe("IntegrationEditor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("saves an entered integration value", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <IntegrationEditor
        defKey="openai_api_key"
        initialValue=""
        isSecret
        testable={false}
        isConfigured={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "replacement-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/integrations/openai_api_key", {
        method: "PUT",
        body: JSON.stringify({ value: "replacement-key" }),
      }),
    );
  });

  it("confirms removal and keeps the dialog open when the API rejects it", async () => {
    mocks.api.mockResolvedValue({ ok: false, error: { message: "Removal denied" } });
    render(
      <IntegrationEditor
        defKey="openai_api_key"
        initialValue=""
        isSecret
        testable={false}
        isConfigured
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove integration" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(mocks.api).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove credential" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Removal denied"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(mocks.api).toHaveBeenCalledWith("/admin/integrations/openai_api_key", {
      method: "DELETE",
    });
  });
});
