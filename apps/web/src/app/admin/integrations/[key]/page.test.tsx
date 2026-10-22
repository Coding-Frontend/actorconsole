import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/admin/server-api", () => ({ api: (...args: unknown[]) => mocks.api(...args) }));
vi.mock("@/components/admin/integration-editor", () => ({ IntegrationEditor: () => null }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));

import IntegrationDetailPage from "./page";

describe("Apify UI-key detail", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("explains automatic authentication instead of asking to replace an expired manual key", async () => {
    mocks.api.mockResolvedValue({
      ok: true,
      data: {
        isConfigured: true,
        isActive: false,
        activeConsoleCredential: "apify_cookies",
        testStatus: "error",
        testMessage: "Update the expired manual UI key to restore access.",
      },
    });
    render(await IntegrationDetailPage({ params: Promise.resolve({ key: "apify_ui_token" }) }));
    expect(screen.getByText("Provided by cookies")).toBeTruthy();
    expect(screen.getByText(/no manual UI key is needed/)).toBeTruthy();
    expect(screen.queryByText(/restore access/)).toBeNull();
  });

  it("does not claim a healthy alternative exists when both credentials have failed", async () => {
    mocks.api.mockResolvedValue({
      ok: true,
      data: {
        isConfigured: true,
        isActive: false,
        activeConsoleCredential: null,
        testStatus: "error",
        testMessage: "The UI key has expired.",
      },
    });
    render(await IntegrationDetailPage({ params: Promise.resolve({ key: "apify_ui_token" }) }));
    expect(screen.getByText("Credential is not working")).toBeTruthy();
    expect(screen.queryByText(/healthy alternative/)).toBeNull();
  });
});
